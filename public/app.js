import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, getDoc, doc, setDoc, addDoc, query, where, serverTimestamp, writeBatch }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n).toFixed(2);
const FREE_SHIP = 50, SHIP_FEE = 4.99;

let cart = (() => { try { return JSON.parse(localStorage.getItem('cart')) || []; } catch { return []; } })();
let user = null, products = [], dbDown = false, ready = false;

/* Built-in catalog: used to fill missing fields, and as a fallback so the store is never empty */
const SEED = [
  ['Aero Wireless Headphones', 'Over-ear headphones with 40-hour battery life and active noise cancelling.', 129, 169, 'Audio', '🎧', '#E0E7FF', 4.7, 2184],
  ['Pulse Smartwatch', 'Heart-rate and sleep tracking with a bright AMOLED display.', 189, 239, 'Wearables', '⌚', '#FFE4D6', 4.6, 1320],
  ['Trail Running Shoes', 'Lightweight cushioning with a grippy all-terrain sole.', 95, 0, 'Fashion', '👟', '#DCFCE7', 4.5, 860],
  ['Everyday Backpack', 'Water-resistant 22L pack with a padded laptop sleeve.', 64, 79, 'Fashion', '🎒', '#FEF3C7', 4.8, 1542],
  ['Mechanical Keyboard', 'Hot-swappable switches, aluminium frame and RGB backlight.', 109, 0, 'Computing', '⌨️', '#EDE9FE', 4.7, 975],
  ['Ceramic Pour-Over Set', 'Dripper, carafe and two cups for slow mornings.', 42, 0, 'Home', '☕', '#FFE4E6', 4.6, 410],
  ['Desk Lamp Pro', 'Dimmable LED lamp with warm-to-cool light and USB charging.', 54, 69, 'Home', '💡', '#FEF9C3', 4.4, 633],
  ['Pocket Bluetooth Speaker', 'Loud, waterproof and small enough for a jacket pocket.', 49, 0, 'Audio', '🔊', '#E0E7FF', 4.5, 1801],
  ['Studio Webcam 4K', 'Sharp video with auto-focus and a built-in privacy shutter.', 79, 99, 'Computing', '📷', '#DCFCE7', 4.3, 512],
  ['Insulated Steel Bottle', 'Keeps drinks cold for 24 hours or hot for 12.', 29, 0, 'Home', '🧴', '#FFE4D6', 4.8, 2760],
  ['Classic Sunglasses', 'Polarised lenses with a lightweight acetate frame.', 58, 0, 'Fashion', '🕶️', '#EDE9FE', 4.4, 298],
  ['Wireless Charging Pad', 'Fast 15W charging for phones and earbuds.', 34, 45, 'Computing', '🔋', '#E0E7FF', 4.5, 1105],
].map(([name, description, price, oldPrice, category, emoji, color, rating, reviews], i) =>
  ({ id: 'p' + String(i + 1).padStart(2, '0'), order: i, name, description, price, oldPrice, category, emoji, color, rating, reviews }));
const SEED_BY_ID = Object.fromEntries(SEED.map((p) => [p.id, p]));
const CAT_EMOJI = { Audio: '🎧', Wearables: '⌚', Fashion: '👟', Computing: '💻', Home: '🏠' };

const friendly = (e) => ({
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Choose a password of at least 6 characters.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not enabled in Firebase yet.',
  'auth/unauthorized-domain': 'Add this website domain in Firebase > Authentication > Settings > Authorized domains.',
  'permission-denied': 'Permission denied. Check your Firestore rules.',
}[e.code] || e.message || 'Something went wrong. Try again.');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  $('#cart-count').textContent = cart.reduce((s, i) => s + i.qty, 0);
}
function renderNav() {
  $('#acct').innerHTML = user
    ? `<span class="hi">Hi, ${esc(user.name.split(' ')[0])}</span><a class="lnk" href="#/orders">Orders</a><a class="lnk" href="#/logout">Log out</a>`
    : `<a class="lnk" href="#/login">Log in</a><a class="solid" href="#/register">Sign up</a>`;
}
function renderCats(active) {
  const cats = [...new Set(products.map((p) => p.category))];
  $('#cats').innerHTML = [['', 'All products'], ...cats.map((c) => [c, c])]
    .map(([c, label]) => `<a href="#/shop${c ? '?cat=' + encodeURIComponent(c) : ''}" class="${active === c ? 'on' : ''}">${esc(label)}</a>`).join('');
}

/* ---------- Data ---------- */
async function fetchProducts() {
  const snap = await getDocs(collection(db, 'products'));
  return snap.docs.map((d) => ({ _id: d.id, ...d.data() })).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
}
async function loadProducts() {
  if (products.length) return products;
  let list = [];
  try {
    list = await fetchProducts();
    if (!list.length && user) { // first run: the admin account loads the sample products
      try {
        const batch = writeBatch(db);
        SEED.forEach(({ id, ...p }) => batch.set(doc(db, 'products', id), p));
        await batch.commit();
        list = await fetchProducts();
      } catch (e) { /* not the admin account */ }
    }
    dbDown = false;
  } catch (e) { console.warn('Firestore products unavailable:', e); dbDown = true; }
  products = list.length
    ? list.map((p) => ({ ...SEED_BY_ID[p._id], ...p }))
    : SEED.map(({ id, ...p }) => ({ _id: id, ...p }));
  return products;
}

/* ---------- Pieces ---------- */
const rate = (p) => `<span class="rate"><i>★</i> ${Number(p.rating || 4.5).toFixed(1)} <small>(${Number(p.reviews || 0).toLocaleString()})</small></span>`;
const pricing = (p) => `<span class="price">${money(p.price)}</span>${p.oldPrice > p.price ? `<span class="old">${money(p.oldPrice)}</span>` : ''}`;
const media = (p) => `<div class="media" style="--c:${esc(p.color)}">${p.oldPrice > p.price ? `<span class="tag">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ''}${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="emo">${p.emoji}</span>`}</div>`;
const card = (p) => `<article class="card"><a href="#/product/${p._id}">${media(p)}</a>
  <div class="body"><span class="cat">${esc(p.category)}</span><a class="name" href="#/product/${p._id}">${esc(p.name)}</a>${rate(p)}
  <div class="row"><div>${pricing(p)}</div><button class="add" data-add="${p._id}" aria-label="Add ${esc(p.name)} to cart">+</button></div></div></article>`;

function addToCart(p, qty = 1) {
  const found = cart.find((i) => i.id === p._id);
  if (found) found.qty = Math.min(20, found.qty + qty);
  else cart.push({ id: p._id, name: p.name, price: p.price, emoji: p.emoji, color: p.color, image: p.image || '', qty });
  saveCart(); toast(`${p.name} added to cart`);
}
const totals = () => {
  const sub = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = sub === 0 || sub >= FREE_SHIP ? 0 : SHIP_FEE;
  return { sub, ship, total: sub + ship };
};

/* ---------- Views ---------- */
function home() {
  const cats = [...new Set(products.map((p) => p.category))];
  $('#app').innerHTML = `${dbDown ? '<div class="notice">Showing the demo catalog because the database could not be reached.</div>' : ''}
  <section class="hero"><div><h1>Tech and home picks you will actually use.</h1>
    <p>Headphones, keyboards, shoes and small upgrades for your day. Fair prices, fast delivery and easy returns.</p>
    <div class="ctas"><a class="btn light" href="#/shop">Shop all products</a><a class="btn" href="#/shop?cat=Audio">Explore audio</a></div></div>
    <div class="stack" aria-hidden="true"><div class="a">🎧</div><div class="b">⌚</div><div class="c">⌨️</div></div></section>
  <section class="sec"><div class="sec-h"><h2>Shop by category</h2></div><div class="tiles">
    ${cats.map((c) => `<a class="tile" href="#/shop?cat=${encodeURIComponent(c)}"><i>${CAT_EMOJI[c] || '🛍️'}</i>${esc(c)}<small>${products.filter((p) => p.category === c).length} products</small></a>`).join('')}</div></section>
  <section class="sec"><div class="sec-h"><h2>Trending now</h2><a href="#/shop">View all</a></div>
    <div class="grid">${products.slice(0, 8).map(card).join('')}</div></section>
  <section class="band"><div><h3>Up to 25% off selected picks</h3><p>Look for the red tag on products. Prices update automatically.</p></div><a class="btn dark" href="#/shop">See the deals</a></section>
  <section class="perks">
    <div class="perk"><i>🚚</i><div><b>Free delivery</b><span>On orders over $50</span></div></div>
    <div class="perk"><i>↩️</i><div><b>7-day returns</b><span>Changed your mind? No problem</span></div></div>
    <div class="perk"><i>🔒</i><div><b>Secure checkout</b><span>Your account is protected</span></div></div>
    <div class="perk"><i>💬</i><div><b>Friendly support</b><span>Real people, quick replies</span></div></div></section>`;
}

function shop(params) {
  const st = { q: params.get('q') || '', cat: params.get('cat') || '', sort: 'featured' };
  $('#hq').value = st.q;
  $('#app').innerHTML = `${dbDown ? '<div class="notice">Showing the demo catalog because the database could not be reached.</div>' : ''}
    <h2 class="title">${esc(st.cat || (st.q ? `Results for "${st.q}"` : 'All products'))}</h2>
    <div class="bar"><span class="count" id="count"></span>
    <select id="sort" aria-label="Sort products"><option value="featured">Featured</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="rating">Top rated</option></select></div>
    <div class="grid" id="grid"></div>`;
  const draw = () => {
    let l = products.filter((p) => (!st.cat || p.category === st.cat) && `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(st.q.toLowerCase()));
    if (st.sort === 'low') l.sort((a, b) => a.price - b.price);
    if (st.sort === 'high') l.sort((a, b) => b.price - a.price);
    if (st.sort === 'rating') l.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    $('#count').textContent = `${l.length} product${l.length === 1 ? '' : 's'}`;
    $('#grid').innerHTML = l.length ? l.map(card).join('') : '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><h2>No products found</h2><p>Try a different word or browse all products.</p><a class="btn" href="#/shop">Show all products</a></div>';
  };
  $('#sort').onchange = (e) => { st.sort = e.target.value; draw(); };
  draw();
}

function product(id) {
  const p = products.find((x) => x._id === id);
  if (!p) throw new Error('Product not found.');
  let qty = 1;
  const related = products.filter((x) => x.category === p.category && x._id !== p._id).slice(0, 4);
  $('#app').innerHTML = `<div class="crumbs"><a href="#/">Home</a> / <a href="#/shop?cat=${encodeURIComponent(p.category)}">${esc(p.category)}</a> / ${esc(p.name)}</div>
    <section class="detail">${media(p)}
      <div><span class="cat">${esc(p.category)}</span><h1>${esc(p.name)}</h1>${rate(p)}
        <div style="margin-top:12px">${pricing(p)}</div><p class="desc">${esc(p.description)}</p>
        <div class="buy"><div class="qty"><button id="m" aria-label="Decrease">−</button><span id="n">1</span><button id="pl" aria-label="Increase">+</button></div>
          <button class="btn" id="add">Add to cart</button><button class="btn dark" id="now">Buy now</button></div>
        <ul class="list"><li>Free delivery on orders over $50</li><li>7-day easy returns</li><li>1-year warranty included</li></ul></div></section>
    ${related.length ? `<section class="sec"><div class="sec-h"><h2>You may also like</h2></div><div class="grid">${related.map(card).join('')}</div></section>` : ''}`;
  $('#m').onclick = () => { qty = Math.max(1, qty - 1); $('#n').textContent = qty; };
  $('#pl').onclick = () => { qty = Math.min(20, qty + 1); $('#n').textContent = qty; };
  $('#add').onclick = () => addToCart(p, qty);
  $('#now').onclick = () => { addToCart(p, qty); location.hash = '#/checkout'; };
}

function cartView() {
  if (!cart.length) {
    $('#app').innerHTML = '<div class="empty"><div class="big">🛒</div><h2>Your cart is empty</h2><p>Add something you like and it will show up here.</p><a class="btn" href="#/shop">Start shopping</a></div>';
    return;
  }
  const { sub, ship, total } = totals();
  const left = Math.max(0, FREE_SHIP - sub);
  $('#app').innerHTML = `<h2 class="title">Shopping cart</h2><div class="split">
    <div class="panel" id="lines">${cart.map((i) => `
      <div class="line"><div class="mini" style="background:${esc(i.color)}">${i.image ? `<img src="${esc(i.image)}" alt="">` : i.emoji}</div>
      <div class="info"><b>${esc(i.name)}</b><span>${money(i.price)}</span></div>
      <div class="qty"><button data-d="${i.id}" aria-label="Decrease">−</button><span>${i.qty}</span><button data-u="${i.id}" aria-label="Increase">+</button></div>
      <button class="btn line sm" data-r="${i.id}">Remove</button></div>`).join('')}</div>
    <aside class="panel"><div class="ship">${left ? `Add ${money(left)} more for free delivery` : 'You have unlocked free delivery'}<div><i style="width:${Math.min(100, (sub / FREE_SHIP) * 100)}%"></i></div></div>
      <div class="sum"><span>Subtotal</span><span>${money(sub)}</span></div><div class="sum"><span>Delivery</span><span>${ship ? money(ship) : 'Free'}</span></div>
      <div class="sum total"><span>Total</span><span>${money(total)}</span></div>
      <a class="btn block" style="margin-top:14px" href="#/checkout">Go to checkout</a></aside></div>`;
  $('#lines').onclick = (e) => {
    const { d, u, r } = e.target.dataset;
    const it = cart.find((i) => i.id === (d || u || r));
    if (!it) return;
    if (u) it.qty = Math.min(20, it.qty + 1);
    if (d) it.qty = Math.max(1, it.qty - 1);
    if (r) cart = cart.filter((i) => i !== it);
    saveCart(); cartView();
  };
}

async function placeOrder(form) {
  const { name, phone, address, city, pin } = form;
  if (!name.trim() || !/^[0-9+\s-]{7,15}$/.test(phone.trim()) || address.trim().length < 5 || !city.trim() || !pin.trim())
    throw new Error('Fill in all delivery details with a valid phone number.');
  products = []; const fresh = await loadProducts(); // prices always come from the catalog, not the browser
  const items = cart.map((c) => { const p = fresh.find((x) => x._id === c.id); return p && { product: p._id, name: p.name, price: p.price, emoji: p.emoji, qty: c.qty }; }).filter(Boolean);
  if (!items.length) throw new Error('Those products are no longer available.');
  const t = totals();
  const sub = items.reduce((s, i) => s + i.price * i.qty, 0), ship = sub >= FREE_SHIP ? 0 : SHIP_FEE;
  await addDoc(collection(db, 'orders'), {
    userId: user.id, items, subtotal: sub, shipping: ship, total: sub + ship,
    address: `${name.trim()}, ${address.trim()}, ${city.trim()} ${pin.trim()}. Phone: ${phone.trim()}`,
    payment: 'Pay on delivery', status: 'Processing', createdAt: serverTimestamp(),
  });
}

function checkout() {
  if (!cart.length) return (location.hash = '#/cart');
  if (!user) { toast('Log in to place your order'); return (location.hash = '#/login'); }
  const { sub, ship, total } = totals();
  $('#app').innerHTML = `<h2 class="title">Checkout</h2><div class="split">
    <div class="panel"><h3>Delivery details</h3><div class="fields">
      <label class="f full">Full name<input id="f-name" autocomplete="name" value="${esc(user.name)}"></label>
      <label class="f">Phone<input id="f-phone" type="tel" autocomplete="tel"></label>
      <label class="f">City<input id="f-city" autocomplete="address-level2"></label>
      <label class="f full">Address<input id="f-address" autocomplete="street-address" placeholder="House number and street"></label>
      <label class="f">PIN / ZIP code<input id="f-pin" autocomplete="postal-code"></label></div>
      <div class="pay"><span>💵</span> Pay on delivery</div><div class="err" id="err"></div></div>
    <aside class="panel"><h3>Order summary</h3>${cart.map((i) => `<div class="sum"><span>${i.emoji} ${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="sum"><span>Subtotal</span><span>${money(sub)}</span></div><div class="sum"><span>Delivery</span><span>${ship ? money(ship) : 'Free'}</span></div>
      <div class="sum total"><span>Total</span><span>${money(total)}</span></div>
      <button class="btn block" id="place" style="margin-top:14px">Place order</button></aside></div>`;
  $('#place').onclick = async (e) => {
    e.target.disabled = true; $('#err').textContent = '';
    try {
      await placeOrder({ name: $('#f-name').value, phone: $('#f-phone').value, address: $('#f-address').value, city: $('#f-city').value, pin: $('#f-pin').value });
      cart = []; saveCart(); toast('Order placed. Thank you!'); location.hash = '#/orders';
    } catch (err) { $('#err').textContent = friendly(err); e.target.disabled = false; }
  };
}

async function orders() {
  if (!user) return (location.hash = '#/login');
  $('#app').innerHTML = '<h2 class="title">Your orders</h2><div class="sk"></div>';
  try {
    const snap = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.id)));
    const list = snap.docs.map((d) => ({ _id: d.id, ...d.data() })).sort((x, y) => (y.createdAt?.seconds || 0) - (x.createdAt?.seconds || 0));
    $('#app').innerHTML = '<h2 class="title">Your orders</h2>' + (list.length ? list.map((o) => `
      <div class="panel order"><header><b>Order #${o._id.slice(-6).toUpperCase()}</b><span class="badge">${esc(o.status)}</span></header>
      <div style="color:var(--mute);margin-bottom:8px">${(o.createdAt ? o.createdAt.toDate() : new Date()).toLocaleDateString(undefined, { dateStyle: 'medium' })}. Ships to ${esc(o.address)}</div>
      ${o.items.map((i) => `<div class="sum"><span>${i.emoji} ${esc(i.name)} × ${i.qty}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div class="sum total"><span>Total</span><span>${money(o.total)}</span></div></div>`).join('')
      : '<div class="empty"><div class="big">📦</div><h2>No orders yet</h2><p>Your orders will appear here after checkout.</p><a class="btn" href="#/shop">Start shopping</a></div>');
  } catch (err) { $('#app').innerHTML = `<div class="empty"><div class="big">⚠️</div><p>${esc(friendly(err))}</p></div>`; }
}

function authView(mode) {
  const reg = mode === 'register';
  $('#app').innerHTML = `<div class="authwrap"><form class="form panel" id="f"><h2>${reg ? 'Create your account' : 'Welcome back'}</h2>
    <p class="sub">${reg ? 'Sign up to check out faster and track your orders.' : 'Log in to see your orders and check out.'}</p>
    ${reg ? '<label>Name<input id="name" required autocomplete="name"></label>' : ''}
    <label>Email<input id="email" type="email" required autocomplete="email"></label>
    <label>Password<input id="pw" type="password" minlength="6" required autocomplete="${reg ? 'new-password' : 'current-password'}"></label>
    <div class="err" id="err"></div><button class="btn block">${reg ? 'Create account' : 'Log in'}</button>
    <p class="alt">${reg ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/register">Create an account</a>'}</p></form></div>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault(); $('#err').textContent = '';
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try {
      const email = $('#email').value.trim(), pw = $('#pw').value;
      if (reg) {
        const name = $('#name').value.trim();
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await updateProfile(cred.user, { displayName: name });
        user = { id: cred.user.uid, name, email }; renderNav();
        try { await setDoc(doc(db, 'users', cred.user.uid), { name, email, createdAt: serverTimestamp() }); } catch (x) { console.warn(x); }
      } else await signInWithEmailAndPassword(auth, email, pw);
      toast(reg ? 'Account created' : 'Logged in');
      location.hash = cart.length ? '#/checkout' : '#/';
    } catch (err) { $('#err').textContent = friendly(err); btn.disabled = false; }
  };
}

/* ---------- Router ---------- */
async function route() {
  const [path, qs = ''] = (location.hash || '#/').slice(2).split('?');
  const [page, id] = path.split('/');
  const params = new URLSearchParams(qs);
  window.scrollTo(0, 0);
  if (page !== 'shop') $('#hq').value = '';
  try {
    if (!products.length) $('#app').innerHTML = '<div class="grid"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
    await loadProducts();
    renderCats(page === 'shop' ? params.get('cat') || '' : null);
    if (!page) home();
    else if (page === 'shop') shop(params);
    else if (page === 'product') product(id);
    else if (page === 'cart') cartView();
    else if (page === 'checkout') checkout();
    else if (page === 'orders') await orders();
    else if (page === 'login') authView('login');
    else if (page === 'register') authView('register');
    else if (page === 'logout') { await signOut(auth); toast('Logged out'); location.hash = '#/'; }
    else location.hash = '#/';
  } catch (err) {
    $('#app').innerHTML = `<div class="empty"><div class="big">⚠️</div><h2>Something went wrong</h2><p>${esc(friendly(err))}</p><a class="btn" href="#/">Back to home</a></div>`;
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]');
  if (!b) return;
  e.preventDefault();
  const p = products.find((x) => x._id === b.dataset.add);
  if (p) addToCart(p);
});
$('#hform').onsubmit = (e) => { e.preventDefault(); const q = $('#hq').value.trim(); location.hash = '#/shop' + (q ? '?q=' + encodeURIComponent(q) : ''); };
addEventListener('hashchange', route);

onAuthStateChanged(auth, (u) => {
  user = u ? { id: u.uid, name: u.displayName || (u.email || 'there').split('@')[0], email: u.email } : null;
  products = []; // reload the catalog for the new login state
  renderNav();
  if (!ready) { ready = true; saveCart(); route(); }
});
