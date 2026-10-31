import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import {
  Link,
  NavLink,
  Routes,
  Route,
  useNavigate,
  useParams,
  useSearchParams,
  Navigate,
} from 'react-router-dom';
import {
  ShoppingBag,
  Heart,
  ArrowRight,
  Search,
  UserRound,
  Bell,
  Menu,
  X,
  Check,
  Package,
  Leaf,
  Truck,
  ArrowUpRight,
  Minus,
  Plus,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { api } from './api';
import {
  money,
  type User,
  type Product,
  type Order,
  type Quote,
  type Address,
  type CartItem,
} from '../../../packages/shared/src';
type Item = Product & { price: number; stock: number };
const Auth = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  notify: (s: string) => void;
}>({ user: null, refresh: async () => {}, notify: () => {} });
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setData(undefined);
    setError('');
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState('');
  const [menu, setMenu] = useState(false);
  const refresh = async () => {
    try {
      setUser(await api('/auth/me'));
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (message: string) => setToast(message);
  return (
    <Auth.Provider value={{ user, refresh, notify }}>
      <div className="announcement">
        A little less ordinary. A little more everyday.{' '}
        <span>
          Meet your new favorites <ArrowRight size={12} />
        </span>
      </div>
      <header>
        <Link className="logo" to="/">
          <span className="logo-mark">
            <Leaf size={22} />
          </span>
          little market<span className="logo-dot">.</span>
        </Link>
        <nav className={menu ? 'open' : ''}>
          <NavLink to="/catalog" onClick={() => setMenu(false)}>
            Shop all
          </NavLink>
          <Link to="/catalog?category=home" onClick={() => setMenu(false)}>
            Home & living
          </Link>
          <Link to="/catalog?category=essentials" onClick={() => setMenu(false)}>
            Everyday essentials
          </Link>
          {user?.role === 'admin' && <NavLink to="/admin/products">Admin</NavLink>}
        </nav>
        <div className="header-actions">
          <Link aria-label="Search products" to="/catalog">
            <Search size={20} />
          </Link>
          <Link aria-label="Wishlist" to="/wishlist">
            <Heart size={20} />
          </Link>
          <Link aria-label="My account" to={user ? '/profile' : '/login'}>
            <UserRound size={20} />
          </Link>
          <Link aria-label="Shopping bag" to="/cart">
            <ShoppingBag size={20} />
          </Link>
          <button
            className="mobile-menu icon"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main>
        {!ready ? (
          <div className="loading">Opening the market…</div>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/catalog" element={<Catalog />} />
            <Route path="/products/:id" element={<ProductPage />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/wishlist"
              element={
                <Guard>
                  <Wishlist />
                </Guard>
              }
            />
            <Route
              path="/cart"
              element={
                <Guard>
                  <Cart />
                </Guard>
              }
            />
            <Route
              path="/checkout"
              element={
                <Guard>
                  <Checkout />
                </Guard>
              }
            />
            <Route
              path="/confirmation/:id"
              element={
                <Guard>
                  <Confirmation />
                </Guard>
              }
            />
            <Route
              path="/profile"
              element={
                <Guard>
                  <Profile />
                </Guard>
              }
            />
            <Route
              path="/addresses"
              element={
                <Guard>
                  <Addresses />
                </Guard>
              }
            />
            <Route
              path="/orders"
              element={
                <Guard>
                  <Orders />
                </Guard>
              }
            />
            <Route
              path="/orders/:id"
              element={
                <Guard>
                  <OrderPage />
                </Guard>
              }
            />
            <Route
              path="/notifications"
              element={
                <Guard>
                  <Notifications />
                </Guard>
              }
            />
            <Route
              path="/admin/products"
              element={
                <Guard admin>
                  <AdminProducts />
                </Guard>
              }
            />
            <Route
              path="/admin/orders"
              element={
                <Guard admin>
                  <AdminOrders />
                </Guard>
              }
            />
            <Route
              path="*"
              element={
                <Empty title="This page wandered off." text="Let's get you back to the market." />
              }
            />
          </Routes>
        )}
      </main>
      <footer>
        <div>
          <Link className="logo" to="/">
            little market.
          </Link>
          <p>
            Good things, simply made.
            <br />A small store for your everyday.
          </p>
        </div>
        <div>
          <strong>Explore</strong>
          <Link to="/catalog">Shop the collection</Link>
          <Link to="/wishlist">Your favorites</Link>
        </div>
        <div>
          <strong>Your corner</strong>
          <Link to="/orders">Orders & tracking</Link>
          <Link to="/notifications">Notifications</Link>
          <Link to="/profile">My account</Link>
        </div>
        <div className="footer-note">
          <Leaf size={24} />
          <p>
            A thoughtfully small demo store.
            <br />
            All payments and shipping are simulated.
          </p>
        </div>
        <div className="copyright">
          © {new Date().getFullYear()} Little Market <span>Made for the everyday.</span>
        </div>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button className="icon" aria-label="Dismiss" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </Auth.Provider>
  );
}
function Guard({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user } = useContext(Auth);
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin')
    return (
      <Empty
        title="Admin access required"
        text="Sign in with the admin demo account to manage the store."
      />
    );
  return children;
}
function Status({ error, loading }: { error?: string; loading?: boolean }) {
  return error ? (
    <div role="alert" className="error">
      {error}
    </div>
  ) : loading ? (
    <div className="loading">Gathering the good things…</div>
  ) : null;
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <ShoppingBag size={42} />
      <h2>{title}</h2>
      <p>{text}</p>
      <Link className="button" to="/catalog">
        Explore the collection <ArrowRight size={16} />
      </Link>
    </div>
  );
}
function Page({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function ProductCard({ product }: { product: Item }) {
  const { user, notify } = useContext(Auth);
  const navigate = useNavigate();
  return (
    <article className="product-card">
      <div className="product-image" style={{ background: product.color }}>
        <Link to={`/products/${product.id}`} aria-label={`View ${product.name}`}>
          <span>{product.emoji}</span>
        </Link>
        <button
          className="favorite"
          aria-label={`Save ${product.name}`}
          onClick={async () => {
            if (!user) {
              navigate('/login');
              return;
            }
            try {
              await api(`/wishlist/${product.id}`, 'PUT');
              notify('Saved to your wishlist');
            } catch (e) {
              notify((e as Error).message);
            }
          }}
        >
          <Heart size={18} />
        </button>
        {product.stock === 0 && <span className="badge">Sold out</span>}
      </div>
      <div className="product-meta">
        <div>
          <p>{product.categoryId}</p>
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </div>
        <strong>{money(product.price)}</strong>
      </div>
    </article>
  );
}
function Home() {
  const { data, error } = useResource<Item[]>('/products');
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span /> THE EVERYDAY, CONSIDERED
          </p>
          <h1>
            Little things.
            <br />
            Better days.
          </h1>
          <p>
            Thoughtful finds for the way you live.
            <br />
            Simple, useful, and a little bit lovely.
          </p>
          <Link className="button" to="/catalog">
            Find your everyday <ArrowUpRight size={18} />
          </Link>
          <div className="hero-foot">
            <span>✦</span> Good design. Everyday prices.
          </div>
        </div>
        <div className="hero-scene">
          <div className="scene-circle" />
          <div className="scene-caption">
            THE LITTLE COLLECTION <span>01 / EVERYDAY</span>
          </div>
          <div className="scene-object pot">🪴</div>
          <div className="scene-object mug">☕</div>
          <div className="scene-object bag">👜</div>
          <div className="scene-label">
            Made for slow mornings.<span>And everything after.</span>
          </div>
          <div className="round-seal">
            LESS, BUT
            <br />
            <Leaf size={24} />
            <br />
            LOVELIER
          </div>
        </div>
      </section>
      <section className="benefits">
        <span>
          <Truck size={19} /> Flat $5 shipping
        </span>
        <span>
          <Leaf size={19} /> Thoughtfully selected
        </span>
        <span>
          <ShieldCheck size={19} /> Simple, simulated checkout
        </span>
      </section>
      <section className="collection">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SMALL FINDS. BIG FAVORITES.</p>
            <h2>Your everyday starts here.</h2>
          </div>
          <Link to="/catalog">
            Explore all products <ArrowRight size={17} />
          </Link>
        </div>
        <Status error={error} loading={!data} />
        <div className="product-grid">
          {data?.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <section className="editorial">
        <div>
          <p className="eyebrow">A LITTLE INTENTION GOES A LONG WAY</p>
          <h2>
            Fewer things.
            <br />
            More meaning.
          </h2>
          <p>
            We believe the best things are the ones you reach for every day. Discover useful pieces
            that feel right at home.
          </p>
          <Link to="/catalog?category=home">
            Make yourself at home <ArrowRight size={17} />
          </Link>
        </div>
        <div className="editorial-art">
          <span>🧶</span>
          <span>☕</span>
          <p>Room for the little things.</p>
        </div>
      </section>
    </>
  );
}
function Catalog() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const { data, error } = useResource<Item[]>(
    `/products?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`,
  );
  const categories = useResource<Array<{ id: string; name: string }>>('/categories');
  return (
    <Page eyebrow="THE COLLECTION" title="Good things for every day.">
      <div className="catalog-bar">
        <label className="search-box">
          <Search size={19} />
          <input
            aria-label="Search products"
            placeholder="Find your next favorite…"
            value={q}
            onChange={(e) => setParams({ q: e.target.value, category })}
          />
        </label>
        <select
          aria-label="Filter category"
          value={category}
          onChange={(e) => setParams({ q, category: e.target.value })}
        >
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span>{data?.length ?? '…'} thoughtful finds</span>
      </div>
      <Status error={error || categories.error} loading={!data} />
      {data?.length === 0 ? (
        <Empty title="No finds just yet" text="Try a different search or category." />
      ) : (
        <div className="product-grid">
          {data?.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </Page>
  );
}
function ProductPage() {
  const { id } = useParams();
  const { data: p, error } = useResource<Item>(`/products/${id}`);
  const reviews = useResource<any[]>(`/products/${id}/reviews`);
  const related = useResource<Item[]>(`/products/${id}/recommendations`);
  const { user, notify } = useContext(Auth);
  const nav = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const add = async () => {
    if (!user) {
      nav('/login');
      return;
    }
    setBusy(true);
    try {
      const cart = await api<{ items: CartItem[] }>('/cart');
      const old = cart.items.find((i) => i.productId === id)?.quantity ?? 0;
      await api(`/cart/items/${id}`, 'PUT', { quantity: old + quantity });
      notify('A good find, added to your bag');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page eyebrow="THE LITTLE DETAILS" title={p?.name ?? 'A thoughtful find'}>
      <Status error={error} loading={!p} />
      {p && (
        <>
          <div className="product-detail">
            <div className="detail-art" style={{ background: p.color }}>
              {p.emoji}
            </div>
            <div className="detail-copy">
              <p className="eyebrow">{p.categoryId}</p>
              <h2>{p.name}</h2>
              <p className="detail-price">{money(p.price)}</p>
              <p>{p.description}</p>
              <p className="stock">
                {p.stock > 0 ? `${p.stock} ready for a new home` : 'Currently sold out'}
              </p>
              <div className="buy-row">
                <label>
                  Quantity
                  <input
                    aria-label="Quantity"
                    type="number"
                    min="1"
                    max="99"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
                <button disabled={busy || p.stock === 0} onClick={add}>
                  Add to bag <ShoppingBag size={17} />
                </button>
              </div>
              <Status error={message} />
              <div className="detail-perks">
                <Truck size={18} /> Flat $5 shipping · Simulated checkout
              </div>
            </div>
          </div>
          <div className="reviews">
            <h2>A few kind words</h2>
            <Status error={reviews.error} />
            {reviews.data?.length === 0 && (
              <p>No reviews yet. Be the first to share a little feedback.</p>
            )}
            {reviews.data?.map((r) => (
              <article key={r.id}>
                <strong>{'★'.repeat(r.rating)}</strong>
                <p>{r.comment}</p>
                <small>{r.name}</small>
              </article>
            ))}
            {user && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await api(`/products/${id}/reviews`, 'POST', {
                      rating: Number(rating),
                      comment,
                    });
                    setComment('');
                    reviews.reload();
                    notify('Thank you for your review');
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                <h3>Share your thoughts</h3>
                <label>
                  Rating
                  <select value={rating} onChange={(e) => setRating(e.target.value)}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} stars
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Your review
                  <textarea
                    required
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <button>Post review</button>
              </form>
            )}
          </div>
          <h2>You might also love</h2>
          <Status error={related.error} />
          <div className="product-grid">
            {related.data?.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </>
      )}
    </Page>
  );
}
function Login() {
  const { user, refresh } = useContext(Auth);
  const [email, setEmail] = useState('shopper@little.market');
  const [password, setPassword] = useState('Demo123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  if (user) return <Navigate to={user.role === 'admin' ? '/admin/products' : '/catalog'} replace />;
  return (
    <Page eyebrow="YOUR LITTLE CORNER" title="Welcome back.">
      <div className="login-layout">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const u = await api<User>('/auth/login', 'POST', { email, password });
              await refresh();
              nav(u.role === 'admin' ? '/admin/products' : '/catalog');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Make yourself at home.</h2>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Status error={error} />
          <button disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} />
          </button>
        </form>
        <div className="demo-note">
          <Leaf size={30} />
          <h2>A store made for exploring.</h2>
          <p>Use a seeded demo account. All purchases are simulated.</p>
          <p>
            <strong>Shopper</strong>
            <br />
            shopper@little.market
            <br />
            sam@little.market
          </p>
          <p>
            <strong>Admin</strong>
            <br />
            admin@little.market
          </p>
          <p>
            Password for all: <code>Demo123!</code>
          </p>
        </div>
      </div>
    </Page>
  );
}
function AccountNav() {
  const { refresh } = useContext(Auth);
  return (
    <div className="account-nav">
      <NavLink to="/profile">Profile</NavLink>
      <NavLink to="/addresses">Addresses</NavLink>
      <NavLink to="/orders">Orders</NavLink>
      <NavLink to="/notifications">Notifications</NavLink>
      <button
        className="text-button"
        onClick={async () => {
          await api('/auth/logout', 'POST');
          await refresh();
        }}
      >
        <LogOut size={14} /> Sign out
      </button>
    </div>
  );
}
function Wishlist() {
  const list = useResource<{ items: string[] }>('/wishlist');
  const products = useResource<Item[]>('/products');
  const { notify } = useContext(Auth);
  return (
    <Page eyebrow="KEPT CLOSE" title="Your little favorites.">
      <Status error={list.error || products.error} loading={!list.data || !products.data} />
      {list.data?.items.length === 0 && (
        <Empty
          title="Room for a few favorites"
          text="Tap a heart on anything that catches your eye."
        />
      )}
      <div className="product-grid">
        {products.data
          ?.filter((p) => list.data?.items.includes(p.id))
          .map((p) => (
            <div key={p.id}>
              <ProductCard product={p} />
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(`/wishlist/${p.id}`, 'DELETE');
                    list.reload();
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                Remove from wishlist
              </button>
            </div>
          ))}
      </div>
    </Page>
  );
}
function Cart() {
  const cart = useResource<{ items: CartItem[] }>('/cart');
  const products = useResource<Item[]>('/products');
  const [error, setError] = useState('');
  const update = async (productId: string, quantity: number) => {
    try {
      if (quantity === 0) await api(`/cart/items/${productId}`, 'DELETE');
      else await api(`/cart/items/${productId}`, 'PUT', { quantity });
      cart.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const subtotal =
    cart.data?.items.reduce(
      (s, i) => s + (products.data?.find((p) => p.id === i.productId)?.price ?? 0) * i.quantity,
      0,
    ) ?? 0;
  return (
    <Page eyebrow="GOOD FINDS, ALL YOURS" title="Your shopping bag.">
      <Status
        error={cart.error || products.error || error}
        loading={!cart.data || !products.data}
      />
      {cart.data?.items.length === 0 ? (
        <Empty
          title="Your bag is taking a little break"
          text="Let's fill it with something lovely."
        />
      ) : (
        cart.data &&
        products.data && (
          <div className="two-column">
            <div>
              {cart.data.items.map((i) => {
                const p = products.data!.find((p) => p.id === i.productId);
                return (
                  <div className="cart-line" key={i.productId}>
                    <div className="mini-art" style={{ background: p?.color }}>
                      {p?.emoji ?? '📦'}
                    </div>
                    <div>
                      <Link to={`/products/${i.productId}`}>
                        {p?.name ?? 'Unavailable product'}
                      </Link>
                      <p>{p ? money(p.price) : 'Remove this item to continue'}</p>
                      <button className="text-button" onClick={() => update(i.productId, 0)}>
                        Remove
                      </button>
                    </div>
                    <div className="stepper">
                      <button
                        aria-label={`Decrease ${p?.name}`}
                        onClick={() => update(i.productId, i.quantity - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{i.quantity}</span>
                      <button
                        aria-label={`Increase ${p?.name}`}
                        disabled={i.quantity >= 99}
                        onClick={() => update(i.productId, i.quantity + 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <strong>{money((p?.price ?? 0) * i.quantity)}</strong>
                  </div>
                );
              })}
            </div>
            <div className="panel summary">
              <h2>A little overview</h2>
              <p>
                <span>Subtotal</span>
                <strong>{money(subtotal)}</strong>
              </p>
              <p>
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </p>
              <p className="muted">
                Have a coupon? Add it at checkout.
                <br />
                Try WELCOME10 for 10% off.
              </p>
              <Link className="button" to="/checkout">
                Continue to checkout <ArrowRight size={16} />
              </Link>
              <Link className="subtle-link" to="/catalog">
                Keep exploring
              </Link>
            </div>
          </div>
        )
      )}
    </Page>
  );
}
export function QuoteSummary({ quote }: { quote: Quote }) {
  return (
    <div className="quote-lines">
      {quote.items.map((i) => (
        <p key={i.productId}>
          <span>
            {i.name} × {i.quantity}
          </span>
          <span>{money(i.lineTotal)}</span>
        </p>
      ))}
      <hr />
      <p>
        <span>Subtotal</span>
        <span>{money(quote.subtotal)}</span>
      </p>
      <p>
        <span>Discount</span>
        <span>−{money(quote.discount)}</span>
      </p>
      <p>
        <span>Shipping</span>
        <span>{money(quote.shipping)}</span>
      </p>
      <p className="total">
        <strong>Total</strong>
        <strong>{money(quote.total)}</strong>
      </p>
    </div>
  );
}
function Checkout() {
  const addresses = useResource<Address[]>('/addresses');
  const [addressId, setAddress] = useState('');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [mode, setMode] = useState('approve');
  const [quote, setQuote] = useState<Quote>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const [key, setKey] = useState(
    () => sessionStorage.getItem('checkoutKey') ?? crypto.randomUUID(),
  );
  useEffect(() => {
    api<Quote>('/checkout/quote', 'POST', { coupon: applied || undefined })
      .then(setQuote)
      .catch((e) => setError(e.message));
  }, [applied]);
  useEffect(() => {
    if (addresses.data?.length && !addressId) setAddress(addresses.data[0].id);
  }, [addresses.data, addressId]);
  const invalidate = () => {
    const next = crypto.randomUUID();
    sessionStorage.removeItem('checkoutKey');
    setKey(next);
  };
  return (
    <Page eyebrow="ONE LAST LITTLE STEP" title="Make it yours.">
      <div className="two-column">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            sessionStorage.setItem('checkoutKey', key);
            try {
              const order = await api<Order>('/checkout', 'POST', {
                addressId,
                coupon: applied || undefined,
                paymentMode: mode,
                key,
              });
              sessionStorage.removeItem('checkoutKey');
              nav(`/confirmation/${order.id}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Where should we send it?</h2>
          <Status error={addresses.error} />
          {addresses.data?.length === 0 ? (
            <p>
              Add a shipping address in <Link to="/addresses">your address book</Link> first.
            </p>
          ) : (
            <label>
              Shipping address
              <select
                required
                value={addressId}
                onChange={(e) => {
                  setAddress(e.target.value);
                  invalidate();
                }}
              >
                {addresses.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.line1}, {a.city}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link className="subtle-link" to="/addresses">
            Manage addresses
          </Link>
          <h3>Try a demo payment</h3>
          <label>
            Payment outcome
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                invalidate();
              }}
            >
              <option value="approve">Approve payment</option>
              <option value="decline">Decline payment</option>
            </select>
          </label>
          <p className="muted">No card details. No real charges. Just a little test drive.</p>
          <Status error={error} />
          <button disabled={busy || !quote || !addressId}>
            {busy ? 'Placing your order…' : 'Place demo order'} <ArrowRight size={16} />
          </button>
          {error && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                invalidate();
                setError('');
              }}
            >
              Start a new attempt
            </button>
          )}
        </form>
        <div className="panel summary">
          <h2>Your good finds</h2>
          {quote && <QuoteSummary quote={quote} />}
          <form
            className="coupon"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              setQuote(undefined);
              setApplied(coupon.trim());
              api<Quote>('/checkout/quote', 'POST', { coupon: coupon.trim() || undefined })
                .then(setQuote)
                .catch((e) => setError(e.message));
              invalidate();
            }}
          >
            <label>
              Coupon code
              <input
                value={coupon}
                placeholder="WELCOME10"
                onChange={(e) => setCoupon(e.target.value)}
              />
            </label>
            <button className="secondary">Apply</button>
          </form>
        </div>
      </div>
    </Page>
  );
}
function Confirmation() {
  const { id } = useParams();
  const { data, error } = useResource<Order>(`/orders/${id}`);
  return (
    <Page eyebrow="A LITTLE HAPPY MOMENT" title="Thanks for shopping small.">
      <Status error={error} loading={!data} />
      {data && (
        <div className="confirmation panel">
          <span className="success-icon">
            <Check size={32} />
          </span>
          <h2>
            {data.status === 'paid'
              ? 'Your good finds are on their way.'
              : 'Your order is being processed.'}
          </h2>
          <p>Order #{data.id.slice(0, 8)}</p>
          <p>We've saved a confirmation in your notifications.</p>
          <Link className="button" to={`/orders/${id}`}>
            View your order <ArrowRight size={16} />
          </Link>
        </div>
      )}
    </Page>
  );
}
function Profile() {
  const resource = useResource<User>('/profile');
  const { notify } = useContext(Auth);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (resource.data) setName(resource.data.name);
  }, [resource.data]);
  return (
    <Page eyebrow="YOUR LITTLE CORNER" title="Hello, you.">
      <AccountNav />
      <Status error={resource.error} />
      {resource.data && (
        <form
          className="panel narrow"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/profile', 'PUT', { name });
              notify('Your profile is updated');
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <h2>The essentials</h2>
          <label>
            Name
            <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Email
            <input disabled value={resource.data.email} />
          </label>
          <p className="muted">Account role: {resource.data.role}</p>
          <Status error={error} />
          <button>Save changes</button>
        </form>
      )}
    </Page>
  );
}
function Addresses() {
  const { data, error, reload } = useResource<Address[]>('/addresses');
  const { notify } = useContext(Auth);
  const [message, setMessage] = useState('');
  return (
    <Page eyebrow="YOUR LITTLE CORNER" title="Your address book.">
      <AccountNav />
      <Status error={error || message} />
      <div className="two-column">
        <div>
          {data?.map((a) => (
            <article className="panel address-card" key={a.id}>
              <strong>{a.name}</strong>
              <p>
                {a.line1}
                <br />
                {a.city}, {a.postalCode}
                <br />
                {a.country}
              </p>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await api(`/addresses/${a.id}`, 'DELETE');
                    reload();
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Remove address
              </button>
            </article>
          ))}
          {data?.length === 0 && <p>No addresses yet. Add your first one here.</p>}
        </div>
        <form
          className="panel"
          onSubmit={async (e: FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fields = Object.fromEntries(new FormData(form));
            try {
              await api('/addresses', 'POST', fields);
              form.reset();
              reload();
              notify('Address added');
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <h2>A new place</h2>
          {[
            ['name', 'Full name'],
            ['line1', 'Street address'],
            ['city', 'City'],
            ['postalCode', 'Postal code'],
            ['country', 'Country code (e.g. US)'],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                required
                maxLength={name === 'country' ? 2 : 160}
                defaultValue={name === 'country' ? 'US' : undefined}
              />
            </label>
          ))}
          <button>Save address</button>
        </form>
      </div>
    </Page>
  );
}
function Orders() {
  const { data, error } = useResource<Order[]>('/orders');
  return (
    <Page eyebrow="YOUR LITTLE CORNER" title="Your good finds, so far.">
      <AccountNav />
      <Status error={error} loading={!data} />
      {data?.length === 0 && (
        <Empty
          title="Your first find is waiting"
          text="Once you place an order, you'll find it right here."
        />
      )}
      {data?.map((o) => (
        <Link className="order-row" key={o.id} to={`/orders/${o.id}`}>
          <Package size={25} />
          <div>
            <strong>Order #{o.id.slice(0, 8)}</strong>
            <p>
              {new Date(o.createdAt).toLocaleDateString()} · {o.quote.items.length} items
            </p>
          </div>
          <span className={`status ${o.status}`}>{o.status}</span>
          <strong>{money(o.quote.total)}</strong>
          <ArrowRight size={18} />
        </Link>
      ))}
    </Page>
  );
}
function OrderPage() {
  const { id } = useParams();
  const order = useResource<Order>(`/orders/${id}`);
  const shipment = useResource<any>(`/orders/${id}/shipment`);
  return (
    <Page eyebrow="EVERY LITTLE DETAIL" title={`Order #${id?.slice(0, 8)}`}>
      <Link to="/orders" className="subtle-link">
        ← All orders
      </Link>
      <Status error={order.error || shipment.error} loading={!order.data} />
      {order.data && (
        <div className="two-column">
          <div className="panel">
            <h2>Your order</h2>
            <span className={`status ${order.data.status}`}>{order.data.status}</span>
            {order.data.failure && <p role="alert">{order.data.failure}</p>}
            <QuoteSummary quote={order.data.quote} />
          </div>
          <div>
            <article className="panel">
              <h2>A little journey</h2>
              <p>
                Shipment: <strong>{shipment.data?.status ?? 'Loading…'}</strong>
              </p>
              <p>{shipment.data?.tracking ?? 'Tracking will appear after confirmation.'}</p>
            </article>
            <article className="panel">
              <h2>Heading to</h2>
              <p>
                {order.data.address.name}
                <br />
                {order.data.address.line1}
                <br />
                {order.data.address.city}, {order.data.address.postalCode}
                <br />
                {order.data.address.country}
              </p>
            </article>
          </div>
        </div>
      )}
    </Page>
  );
}
function Notifications() {
  const notes = useResource<any[]>('/notifications');
  const { notify } = useContext(Auth);
  return (
    <Page eyebrow="YOUR LITTLE CORNER" title="A few little updates.">
      <AccountNav />
      <Status error={notes.error} loading={!notes.data} />
      {notes.data?.length === 0 && (
        <p className="panel">All quiet here. Order updates will appear in this space.</p>
      )}
      {notes.data?.map((n) => (
        <article className="order-row" key={n.id}>
          <Bell size={24} />
          <div>
            <p>{n.message}</p>
            <small>{new Date(n.createdAt).toLocaleString()}</small>
          </div>
          {n.read ? (
            <span className="muted">Read</span>
          ) : (
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await api(`/notifications/${n.id}/read`, 'PUT');
                  notes.reload();
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              Mark read
            </button>
          )}
        </article>
      ))}
    </Page>
  );
}
function AdminNav() {
  return (
    <div className="account-nav">
      <NavLink to="/admin/products">Products & inventory</NavLink>
      <NavLink to="/admin/orders">Orders & activity</NavLink>
      <Link to="/profile">Account</Link>
    </div>
  );
}
function AdminProducts() {
  const products = useResource<Item[]>('/admin/products');
  const categories = useResource<any[]>('/categories');
  const [editing, setEditing] = useState<Partial<Item> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { notify } = useContext(Auth);
  return (
    <Page
      eyebrow="BEHIND THE COUNTER"
      title="The little store room."
      action={
        <button
          onClick={() => {
            setError('');
            setEditing({
              name: '',
              description: '',
              categoryId: 'essentials',
              emoji: '📦',
              color: '#eadcc8',
              active: true,
              price: 2000,
              stock: 10,
            });
          }}
        >
          Add product <Plus size={16} />
        </button>
      }
    >
      <AdminNav />
      <Status error={products.error || categories.error} loading={!products.data} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Edit</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="table-emoji">{p.emoji}</span>
                  {p.name}
                </td>
                <td>{p.categoryId}</td>
                <td>{money(p.price)}</td>
                <td>{p.stock}</td>
                <td>{p.active ? 'Active' : 'Hidden'}</td>
                <td>
                  <button
                    className="text-button"
                    aria-label={`Edit ${p.name}`}
                    onClick={() => {
                      setError('');
                      setEditing(p);
                    }}
                  >
                    Edit <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Product editor"
            className="modal panel"
          >
            <button
              className="icon close"
              aria-label="Close editor"
              onClick={() => setEditing(null)}
            >
              <X />
            </button>
            <h2>{editing.id ? 'Edit a good find' : 'Add a good find'}</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  const { id, price, stock, ...product } = editing;
                  await api(`/admin/products${id ? `/${id}` : ''}`, id ? 'PUT' : 'POST', {
                    product,
                    amount: price,
                    quantity: stock,
                  });
                  products.reload();
                  setEditing(null);
                  notify('Product saved');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {[
                ['name', 'Name'],
                ['description', 'Description'],
                ['emoji', 'Emoji'],
                ['color', 'Color'],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    required
                    value={String(editing[key as keyof Item] ?? '')}
                    onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                  />
                </label>
              ))}
              <label>
                Category
                <select
                  value={editing.categoryId}
                  onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}
                >
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Price (cents)
                  <input
                    type="number"
                    min="0"
                    required
                    value={editing.price}
                    onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                  />
                </label>
                <label>
                  Stock
                  <input
                    type="number"
                    min="0"
                    required
                    value={editing.stock}
                    onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                  />
                </label>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editing.active}
                  onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                />
                Visible in store
              </label>
              <Status error={error} />
              <button disabled={busy}>Save product</button>
            </form>
          </section>
        </div>
      )}
    </Page>
  );
}
function AdminOrders() {
  const orders = useResource<Order[]>('/admin/orders');
  const audit = useResource<any[]>('/admin/audit');
  const { notify } = useContext(Auth);
  const [error, setError] = useState('');
  return (
    <Page eyebrow="BEHIND THE COUNTER" title="Orders, on their way.">
      <AdminNav />
      <Status error={orders.error || audit.error || error} loading={!orders.data} />
      {orders.data?.length === 0 && (
        <p className="panel">No orders yet. Complete a demo checkout to get started.</p>
      )}
      {orders.data?.map((o) => (
        <div className="order-row" key={o.id}>
          <Link to={`/orders/${o.id}`}>#{o.id.slice(0, 8)}</Link>
          <span>{o.address.name}</span>
          <strong>{money(o.quote.total)}</strong>
          <span className={`status ${o.status}`}>{o.status}</span>
          {o.status === 'paid' && (
            <label className="sr-label">
              Update shipment
              <select
                aria-label={`Update shipment ${o.id.slice(0, 8)}`}
                defaultValue=""
                onChange={async (e) => {
                  const select = e.currentTarget;
                  try {
                    await api(`/admin/orders/${o.id}/shipment`, 'PUT', { status: select.value });
                    audit.reload();
                    notify('Shipment updated');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                  select.value = '';
                }}
              >
                <option disabled value="">
                  Set shipment status
                </option>
                <option value="processing">Processing</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
              </select>
            </label>
          )}
        </div>
      ))}
      <h2 className="spaced">Recent store activity</h2>
      <div className="panel">
        {audit.data?.length === 0 && <p>Admin changes and checkout activity will appear here.</p>}
        {audit.data
          ?.slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 30)
          .map((a) => (
            <p className="audit-line" key={a.id}>
              <strong>{a.action}</strong>
              <span>{a.actor}</span>
              <small>{new Date(a.createdAt).toLocaleString()}</small>
            </p>
          ))}
      </div>
    </Page>
  );
}
