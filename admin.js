(() => {
  const SUPABASE_URL = window.EMDAX_SUPABASE_URL;
  const SUPABASE_KEY = window.EMDAX_SUPABASE_ANON_KEY;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const $ = (id) => document.getElementById(id);
  const loginView = $('login-view');
  const dashboardView = $('dashboard-view');
  const loginForm = $('login-form');
  const loginError = $('login-error');
  const loginSubmit = $('login-submit');
  const logoutBtn = $('logout-btn');
  const adminUser = $('admin-user');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function slugify(s) {
    return String(s || '').toLowerCase().trim()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'}); }
    catch { return iso; }
  }
  function setStatus(el, msg, type) {
    el.textContent = msg || '';
    el.className = 'admin-status' + (type ? ' ' + type : '');
  }

  // --- Auth ---
  async function showAuthed(user) {
    loginView.hidden = true;
    dashboardView.hidden = false;
    logoutBtn.hidden = false;
    adminUser.textContent = user.email || '';
    await Promise.all([loadPosts(), loadInventory()]);
  }
  function showLogin() {
    loginView.hidden = false;
    dashboardView.hidden = true;
    logoutBtn.hidden = true;
    adminUser.textContent = '';
  }

  async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user) await showAuthed(session.user);
    else showLogin();
    sb.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) await showAuthed(session.user);
      else showLogin();
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    loginSubmit.disabled = false;
    loginSubmit.innerHTML = 'Sign in <span>↗</span>';
    if (error) { loginError.textContent = error.message; return; }
    loginForm.reset();
  });

  logoutBtn.addEventListener('click', async () => { await sb.auth.signOut(); });

  // --- Tabs ---
  document.querySelectorAll('.admin-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.admin-tabpanel').forEach(p => p.hidden = true);
      btn.classList.add('active');
      btn.setAttribute('aria-selected','true');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.hidden = false;
    });
  });

  // --- Blog posts ---
  const postsList = $('posts-list');
  const postFormWrap = $('post-form-wrap');
  const postForm = $('post-form');
  const postFormTitle = $('post-form-title');
  const postFormStatus = $('post-form-status');

  function openPostForm(post) {
    postForm.reset();
    setStatus(postFormStatus, '');
    $('post-id').value = post?.id || '';
    $('post-title').value = post?.title || '';
    $('post-slug').value = post?.slug || '';
    $('post-category').value = post?.category || '';
    $('post-cover').value = post?.cover_image || '';
    $('post-summary').value = post?.summary || '';
    $('post-body').value = post?.body_html || '';
    $('post-published').checked = post ? !!post.published : true;
    postFormTitle.textContent = post ? 'Edit post' : 'New post';
    postFormWrap.hidden = false;
    postFormWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closePostForm() { postFormWrap.hidden = true; postForm.reset(); setStatus(postFormStatus,''); }

  $('new-post-btn').addEventListener('click', () => openPostForm(null));
  $('post-cancel-btn').addEventListener('click', closePostForm);
  $('post-title').addEventListener('input', (e) => {
    if (!$('post-id').value) $('post-slug').value = slugify(e.target.value);
  });

  async function loadPosts() {
    postsList.innerHTML = '<div class="admin-empty">Loading posts…</div>';
    const { data, error } = await sb.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) { postsList.innerHTML = `<div class="admin-empty">Error loading posts: ${esc(error.message)}</div>`; return; }
    if (!data.length) { postsList.innerHTML = '<div class="admin-empty">No blog posts yet. Create your first post.</div>'; return; }
    postsList.innerHTML = data.map(p => `
      <article class="admin-item">
        <div>
          <h3>${esc(p.title)} <span class="admin-badge ${p.published ? 'pub':'draft'}">${p.published ? 'Published':'Draft'}</span></h3>
          <div class="admin-item-meta">
            <span>${esc(p.category || 'Uncategorized')}</span>
            <span>${esc(p.slug)}</span>
            <span>${fmtDate(p.created_at)}</span>
          </div>
          <div class="admin-item-meta" style="margin-top:6px">${esc((p.summary||'').slice(0,160))}${(p.summary||'').length>160?'…':''}</div>
        </div>
        <div class="admin-actions">
          <button type="button" data-edit-post="${esc(p.id)}">Edit</button>
          <button type="button" class="danger" data-delete-post="${esc(p.id)}">Delete</button>
        </div>
      </article>`).join('');
    postsList.querySelectorAll('[data-edit-post]').forEach(btn => btn.addEventListener('click', () => {
      const post = data.find(x => x.id === btn.dataset.editPost);
      if (post) openPostForm(post);
    }));
    postsList.querySelectorAll('[data-delete-post]').forEach(btn => btn.addEventListener('click', () => deletePost(btn.dataset.deletePost)));
  }

  postForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(postFormStatus, 'Saving…');
    const id = $('post-id').value.trim();
    const payload = {
      title: $('post-title').value.trim(),
      slug: slugify($('post-slug').value.trim() || $('post-title').value),
      category: $('post-category').value.trim(),
      cover_image: $('post-cover').value.trim(),
      summary: $('post-summary').value.trim(),
      body_html: $('post-body').value.trim(),
      published: $('post-published').checked
    };
    if (!payload.title || !payload.slug) { setStatus(postFormStatus, 'Title and slug are required.', 'err'); return; }
    let error;
    if (id) {
      ({ error } = await sb.from('blog_posts').update(payload).eq('id', id));
    } else {
      ({ error } = await sb.from('blog_posts').insert(payload));
    }
    if (error) { setStatus(postFormStatus, error.message, 'err'); return; }
    setStatus(postFormStatus, 'Saved.', 'ok');
    await loadPosts();
    setTimeout(closePostForm, 600);
  });

  async function deletePost(id) {
    if (!confirm('Delete this blog post? This cannot be undone.')) return;
    const { error } = await sb.from('blog_posts').delete().eq('id', id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await loadPosts();
  }

  // --- Inventory ---
  const inventoryList = $('inventory-list');
  const itemFormWrap = $('item-form-wrap');
  const itemForm = $('item-form');
  const itemFormTitle = $('item-form-title');
  const itemFormStatus = $('item-form-status');

  function openItemForm(item) {
    itemForm.reset();
    setStatus(itemFormStatus, '');
    $('item-id').value = item?.id || '';
    $('item-name').value = item?.name || '';
    $('item-brand').value = item?.brand || '';
    $('item-condition').value = item?.condition || '';
    $('item-price').value = item?.price || '';
    $('item-image').value = item?.image_url || '';
    $('item-small-image').value = item?.small_image_url || '';
    $('item-alt').value = item?.alt || '';
    $('item-sort').value = item?.sort_order ?? 0;
    $('item-specs').value = Array.isArray(item?.specs) ? item.specs.join('\n') : '';
    $('item-whatsapp').value = item?.whatsapp_text || '';
    $('item-published').checked = item ? !!item.published : true;
    itemFormTitle.textContent = item ? 'Edit listing' : 'New listing';
    itemFormWrap.hidden = false;
    itemFormWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeItemForm() { itemFormWrap.hidden = true; itemForm.reset(); setStatus(itemFormStatus,''); }

  $('new-item-btn').addEventListener('click', () => openItemForm(null));
  $('item-cancel-btn').addEventListener('click', closeItemForm);

  async function loadInventory() {
    inventoryList.innerHTML = '<div class="admin-empty">Loading inventory…</div>';
    const { data, error } = await sb.from('inventory').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (error) { inventoryList.innerHTML = `<div class="admin-empty">Error loading inventory: ${esc(error.message)}</div>`; return; }
    if (!data.length) { inventoryList.innerHTML = '<div class="admin-empty">No inventory listings yet. Add your first laptop.</div>'; return; }
    inventoryList.innerHTML = data.map(item => {
      const specs = Array.isArray(item.specs) ? item.specs : [];
      return `
      <article class="admin-item">
        <div>
          <h3>${esc(item.name)} <span class="admin-badge ${item.published ? 'pub':'draft'}">${item.published ? 'Published':'Draft'}</span></h3>
          <div class="admin-item-meta">
            <span>${esc(item.brand || '')}</span>
            <span>${esc(item.condition || '')}</span>
            <span>${esc(item.price || '')}</span>
            <span>Sort: ${esc(item.sort_order ?? 0)}</span>
          </div>
          <div class="admin-item-meta" style="margin-top:6px">${esc(specs.join(' • '))}</div>
        </div>
        <div class="admin-actions">
          <button type="button" data-edit-item="${esc(item.id)}">Edit</button>
          <button type="button" class="danger" data-delete-item="${esc(item.id)}">Delete</button>
        </div>
      </article>`;
    }).join('');
    inventoryList.querySelectorAll('[data-edit-item]').forEach(btn => btn.addEventListener('click', () => {
      const item = data.find(x => x.id === btn.dataset.editItem);
      if (item) openItemForm(item);
    }));
    inventoryList.querySelectorAll('[data-delete-item]').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.deleteItem)));
  }

  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setStatus(itemFormStatus, 'Saving…');
    const id = $('item-id').value.trim();
    const specs = $('item-specs').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const name = $('item-name').value.trim();
    const price = $('item-price').value.trim();
    const payload = {
      name,
      brand: $('item-brand').value.trim(),
      condition: $('item-condition').value.trim(),
      price,
      image_url: $('item-image').value.trim(),
      small_image_url: $('item-small-image').value.trim(),
      alt: $('item-alt').value.trim(),
      sort_order: parseInt($('item-sort').value || '0', 10) || 0,
      specs,
      whatsapp_text: $('item-whatsapp').value.trim() || `Hello Emdax, I am interested in the ${name} listed for ${price}. Is it available?`,
      published: $('item-published').checked
    };
    if (!payload.name) { setStatus(itemFormStatus, 'Name is required.', 'err'); return; }
    let error;
    if (id) {
      ({ error } = await sb.from('inventory').update(payload).eq('id', id));
    } else {
      ({ error } = await sb.from('inventory').insert(payload));
    }
    if (error) { setStatus(itemFormStatus, error.message, 'err'); return; }
    setStatus(itemFormStatus, 'Saved.', 'ok');
    await loadInventory();
    setTimeout(closeItemForm, 600);
  });

  async function deleteItem(id) {
    if (!confirm('Delete this inventory listing? This cannot be undone.')) return;
    const { error } = await sb.from('inventory').delete().eq('id', id);
    if (error) { alert('Delete failed: ' + error.message); return; }
    await loadInventory();
  }

  initAuth();
})();
