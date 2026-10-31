# Public API

The frontend uses same-origin `/api/v1`. JSON is sent only when there is a body. Errors return `{ "message": "...", "requestId": "..." }`. Successful login sets an opaque `session` cookie; user identity is derived on the server. Unauthenticated private requests return 401. Admin-only requests from shoppers return 403. Other shoppers' orders return 404.

Each backend exposes `/docs/json` with generated OpenAPI route listings and `/docs` linking to that specification. To inspect a backend locally, port-forward its Service to port 4000. These internal route listings supplement the public contracts below; request validation is implemented with Zod.

| Method       | Path under `/api/v1`            | Behavior / body                                                              |
| ------------ | ------------------------------- | ---------------------------------------------------------------------------- |
| POST         | `/auth/login`                   | `{email, password}` → safe user and session cookie                           |
| GET          | `/auth/me`                      | Current user                                                                 |
| POST         | `/auth/logout`                  | Revoke session, clear cookie                                                 |
| GET          | `/products?q=&category=`        | Active products enriched with `price` and `stock`                            |
| GET          | `/products/:id`                 | Product detail, 404 for hidden/missing products                              |
| GET          | `/categories`                   | Seeded category list                                                         |
| GET          | `/products/:id/recommendations` | Related products                                                             |
| GET / POST   | `/products/:id/reviews`         | Read reviews; authenticated write `{rating: 1..5, comment}`                  |
| GET / PUT    | `/profile`                      | Read account; update `{name}`                                                |
| GET / POST   | `/addresses`                    | List owned addresses; add `{name,line1,city,postalCode,country}`             |
| DELETE       | `/addresses/:id`                | Delete owned address                                                         |
| GET          | `/cart`                         | `{items:[{productId,quantity}]}`                                             |
| PUT          | `/cart/items/:id`               | Set absolute `{quantity:1..99}`                                              |
| DELETE       | `/cart/items/:id`               | Remove item                                                                  |
| GET          | `/wishlist`                     | `{items:[productId]}`                                                        |
| PUT / DELETE | `/wishlist/:id`                 | Add/remove favorite                                                          |
| POST         | `/checkout/quote`               | `{coupon?}` → authoritative quote from current cart                          |
| POST         | `/checkout`                     | `{key,addressId,paymentMode:"approve"                                        | "decline",coupon?}` → order |
| GET          | `/orders`                       | Owned orders, newest first                                                   |
| GET          | `/orders/:id`                   | Owned order; admins can also inspect                                         |
| GET          | `/orders/:id/shipment`          | Owned order shipment; admins can also inspect                                |
| GET          | `/notifications`                | Owned in-app notifications                                                   |
| PUT          | `/notifications/:id/read`       | Mark owned notification read                                                 |
| GET          | `/admin/products`               | All products, including hidden products                                      |
| POST / PUT   | `/admin/products[/:id]`         | `{product:{name,description,categoryId,emoji,color,active},amount,quantity}` |
| GET          | `/admin/orders`                 | All orders                                                                   |
| PUT          | `/admin/orders/:id/shipment`    | `{status:"processing"                                                        | "shipped"                   | "delivered"}` for paid orders |
| GET          | `/admin/audit`                  | Admin changes and checkout outcomes                                          |

All amounts are integer USD cents. Quote responses contain `items`, `subtotal`, `discount`, `shipping`, `total`, and `currency`. Order responses contain `id`, `userId`, `status` (`pending`, `paid`, `failed`), `quote`, `address`, `createdAt`, and optional `failure`.

Checkout keys must be 8–80 characters; generate a UUID. Keep the same key for a retry after a network error or processing response. Starting a new checkout key creates a new purchase intent. The browser preserves its current key in session storage until success or an explicit new attempt.
