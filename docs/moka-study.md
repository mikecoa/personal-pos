# Moka POS — Feature Study

Sources (20 Nov 2026): Google Play listing for `com.mokapos.android`, the Moka backoffice login page, and the full public help center at help.mokapos.com (104 articles, including the 11-part "Getting Started" training series). I couldn't see the backoffice itself because it needs a login.

---

## 1. Product shape

Moka has two surfaces that share one cloud account:

| Surface | Who uses it | Purpose |
|---|---|---|
| **POS app** (Android / iPad tablet) | Cashiers, waiters | Ring up sales, take payments, run shifts, manage open bills and tables. Works offline and syncs later. It has only light editing (items, categories, % discounts). |
| **Backoffice** (web, desktop + mobile browser) | Owner, managers | All configuration, catalog, inventory, customers, employees, reports. Settings made here drive what the app shows. |

**Tenancy model:** Account (business, owner) → **Outlets** (locations). Nearly every record belongs to an outlet:
- Saving an item, modifier, gratuity, ingredient or recipe gives the choice **"Save"** (this outlet only) or **"Save to All Outlets"**.
- "Update to All Outlets" bulk-edits items **matched by name** across outlets (case-insensitive, exact spelling).
- Discounts and promos are created once and then **assigned to outlets**.
- Employees are **assigned to one or more outlets**.
- Dashboards and reports filter by **All Outlets** or one outlet.
- Stock can move between outlets with **Transfer**.

➡ This fits your requirement: separate data per location, with the owner able to see all of them together.

---

## 2. Backoffice modules (menu structure as described in the help docs)

### Dashboard
- Filters: outlet (All / one) and date range.
- **Sales summary:** Gross Sales, Net Sales (after discounts, promos and refunds), Gross Profit (Net − COGS), Number of Transactions, Avg Sale per Transaction, Gross Margin %.
- **Item summary:** Top 10 items, top 3 items per category, category by volume, category by sales.

### Reports (export to CSV/ZIP)
- **Sales:** summary with trends by day, hour and week; gross profit; payment methods; sales type; item sales (per variant); category sales; brand sales; modifier sales; discounts; taxes; gratuity; *Collected By* (cashier); *Served By* (waiter).
- **Transactions:** per-transaction list, including open bills.
- **Invoices:** instalments and due dates for "pay later" invoice sales.
- **Shift:** per shift: employee, start/end, Total Expected vs Actual vs Difference; breakdown by cash (starting cash, cash sales, invoice cash, refunds, income/expense), e-wallet and EDC/card.
- **Table report.**
- Data retention: the last 2 calendar years are kept online.

### Library (catalog)
- **Item Library:** name (unique), category, photo, price, SKU/barcode, **variants** (each with its own price, SKU and stock), stock tracking (In Stock and "Alert at" level), COGS tracking (average cost), modifiers, description, brand, per-sales-type price, and product attributes (pre-order with 1–90 processing days, weight, dimensions, condition). Import and export through Excel/CSV. Bulk edit across outlets.
- **Modifiers:** sets (e.g. "Topping") with options and prices. Optional **Modifier Stock** links each option to ingredients and deducts them when sold.
- **Categories.**
- **Bundle Package:** combo menu made of component items, with its own price. Stock is deducted from the components, and modifiers work inside bundles.
- **Discounts:** % or fixed amount, applied per item or per bill, assigned to outlets.
- **Promo** (rule engine): types *Discount per Item* (% or Rp), *Free Item*, and *Price Cuts* (strike-through price for the online store). Sets: outlets, sales types (all or specific), purchase requirement (specific items/variants with AND/OR and a quantity, or any item from a category) and reward. Promo names show in reports.
- **Taxes:** named, percentage.
- **Gratuity:** named percentage service charges (e.g. service tip).
- **Sales Types:** Dine In, Take Away, GoFood and so on. Each can have its own item price, and promos can target them.

### Inventory
- **Summary:** per outlet and period, for items and ingredients: Beginning, Production (semi-finished), Purchase Order, Usage, Transfer (±), Adjustment, Ending. Exportable.
- **Suppliers:** name, phone, email, address.
- **Purchase Order:** outlet + supplier + lines (qty, unit cost). "Create" or "Create and Fulfill". A printable document that is emailed to the supplier.
- **Transfer:** stock between outlets (items or ingredients).
- **Adjustment:** stock opname. Enter the actual count and the system records the difference.
- **Advanced mode** (setting): Transfer and PO become an approval workflow — Request → Approve / Reject (full rejection or "revise") → Ship (full or partial) → Fulfil (accept, or flag damaged goods). Each step is gated by employee role.

### Ingredients (premium module)
- **Ingredient Library:** raw ingredients in the smallest unit (g, ml), with stock, alert level and COGS.
- **Semi-finished ingredients** (multi-layer): made from raw ingredients, with a "production" event that consumes the raw ingredients.
- **Recipes:** item/variant → list of ingredients and quantities, with an automatic total average cost. Excel import.

### Customers (CRM)
- **Customer list:** All / Loyalty members / Non-members; visit count, average spend, purchase history; CSV import and export.
- **Feedback:** customers rate their purchase from the emailed or SMS receipt; the owner replies.
- **Loyalty program:** earn points per Rp spent or per item/category bought, plus sign-up bonus points. Rewards: % off the bill, Rp off the bill, or a free item.

### Employees
- **Employee slots:** invite by email (name, phone), role, outlets, optional 4-digit unique PIN, notes.
- **Employee access (roles):** Administrator (cannot be deleted; can manage employees), Cashier (app only), plus custom roles with separate **App permissions** and **Backoffice permissions** checklists.
- **PIN access:** require a manager PIN for actions such as print bill, manage open bills, apply discounts, manage discounts, issue refunds, resend receipts, record or cancel invoices, view shift history, edit customers and view activity.

### Table management (module)
- **Table groups** (areas, active/inactive), **table map** (drag layout: name, seats/pax, shape), **table report**.

### Settings / Account settings
- **Account:** owner personal details, business info, tax ID, password, phone/email verification (OTP).
- **Outlets:** add and edit (name, phone, address).
- **Bank accounts:** for e-wallet settlement (owner only).
- **Payment methods:** activate e-wallets/QRIS, plus custom payment types.
- **Receipt:** per outlet — logo, name, address, phone, social media, footer.
- **Checkout:** tax on/off, gratuity on/off, prices **include** or **exclude** tax and gratuity, tax before or after discount, **rounding** (to hundreds or thousands, with a "round down below" threshold), **stock limit alert / block selling at zero stock**, **track servers** (waiter attribution).
- **Inventory:** simple vs advanced Transfer/PO, and approver roles.
- **Public profile**, **email notifications** (daily reports, promos).
- **Security:** 2FA via email or WhatsApp OTP.

### Integrations / online (Moka-specific, probably optional for you)
- Moka Order: online store with pickup, delivery and **QR dine-in ordering at the table**.
- GoFood/GrabFood menu sync (through Hubster), GoPay/QRIS and EDC card terminal link, Moka Connect API marketplace (accounting and other apps).

---

## 3. POS app (tablet)

Four main sections:

1. **Point of Sale**
   - Item grid with Library/Favorites tabs, search by name or SKU, barcode scanner.
   - Cart: choose the **sales type**; tap a line to change qty, variant, modifiers, discount or note; **custom amount** line; remove a line (with a reason).
   - **Save bill** (named open bill) → Billing List → print bill, edit, delete (with a reason).
   - **Split bill** by items and quantities (blocked when a promo is in the cart).
   - **Tables:** pick a table, then **move** or **merge** tables; occupied tables show "Taken".
   - Customer attach, loyalty sign-up and points redemption.
   - **Charge:** cash (quick amounts and change), card/EDC, e-wallets/QRIS, custom methods, **invoice** (customer + due date, online only), split payment.
   - Receipt: print, email, SMS, WhatsApp.
2. **Activity:** transaction history and search, resend or reprint receipt, **issue refund** (choose items and a reason), record invoice payments (amount, date, method), daily sales summary.
3. **Shift**
   - Start shift with starting cash (or start automatically with a default amount).
   - Record cash **income/expense** with a description.
   - End shift by entering the actual cash; shows expected vs actual; print the shift summary; shift history.
4. **Settings:** language, printers (Bluetooth/LAN/USB; each printer is mapped to the documents it prints: receipt, kitchen order ticket, label sticker, queue number, shift recap), cash drawer, barcode scanner, customer-facing second display (cart, promos, QR payment), online-order inbox.

Other app behaviour:
- **Offline mode:** sales are stored locally and synced when back online. Catalog edits need a connection.
- Employee login with email/password, plus PIN switching and PIN-gated actions.

---

## 4. Implications for your build

**Data isolation per location (your key requirement)**
- `account → locations`. Every operational table (items, categories, modifiers, stock, sales, shifts, customers?, tables, printers) carries `location_id`, enforced at the database layer (e.g. Postgres row-level security keyed on the user's allowed locations), not only in app code.
- Catalog is per location, as in Moka, with explicit **"copy to locations"** and **"sync changes to locations"** actions. I'd link copies by a shared `catalog_key` rather than matching by name as Moka does (its name matching is fragile).
- Decide: are **customers and loyalty** per location or shared across the account? Moka's customer list spans the account. Your requirement suggests per location, but shared loyalty is a common want.
- Owner reports can aggregate across locations (read-only roll-up); everything else is scoped to one location.

**Accounting formulas to copy exactly:** Gross Sales, Net Sales (− discounts, promos, refunds), COGS (weighted average cost), Gross Profit, shift expected cash = start + cash sales + cash invoice payments − cash refunds ± income/expense.

**Hard parts worth designing early:** offline-first POS sync (local DB + idempotent transaction upload), the promo rule engine, stock deduction through recipes, semi-finished ingredients, modifiers and bundles, and printer drivers (ESC/POS over Bluetooth/LAN).

**Likely skip or postpone:** GoFood/GrabFood/Hubster, Moka Order online store, capital loans, Moka hardware, e-wallet settlement (use manual payment types or a payment gateway later).

---

## 5. Logged-in backoffice (seen 20 Nov 2026, read only, nothing changed)

Account: one outlet, Moka Basic plan (1-year billing). Ingredients, Recipes and Table Management are locked behind upgrades (Pro Rp 499k, Enterprise Rp 799k).

### Exact sidebar
```
DASHBOARD                (tabs: Summary | Outlet Comparison [needs 2+ outlets])
GOPAY BIO                Setup, Analytics
POS
├─ Reports               Sales, Transactions, Invoices, Shift
├─ Library               Item Library, Modifiers, Categories, Bundle Package, Promo,
│                        Discounts, Taxes, Gratuity, Sales Type, Brands
├─ Ingredient            Ingredient Library, Ingredient Categories, Recipes
├─ Inventory             Summary, Suppliers, Purchase Order (PO), Transfer, Adjustment
├─ Online Channels       Moka Order, GoFood
├─ Customers             Customers List, Feedback, Loyalty Program
├─ Employees             Employee Slots, Employee Access, PIN Access
├─ Customer Display      Campaign, Settings
├─ Table Management      Table Group, Table Map, Table Report
├─ Partner Solutions     (app marketplace)
└─ Payments              QRIS, Payment Configuration
ACCOUNT SETTINGS
├─ Account, Billing
└─ POS                   Outlets, Bank Account, Public Profile, Receipt, Checkout,
                         Inventory, Email Notification
```
UI pattern: a dark left sidebar with collapsible groups, a page title with a primary action button on the right, an outlet picker, a date-range picker with presets (Today, Yesterday, This/Last Week, This/Last Month, This/Last Year, plus a time-of-day range), a table, and Export. Create/edit forms open as a **right-hand side panel** over the list.

### Page details
- **Item Library list:** filters for outlet, category, and stock state (All / Low Stock Alert / Out of Stock Alert), plus search. Columns: Name, Category, Pricing (shows "Sales Type" when prices differ per sales type), In Stock, Stock Alert. Import/Export items.
- **Item form:** *General* (POS image, Product Name*, Category, Brand, Description) · *Moka Order self pickup & delivery* toggle · *Pricing* ("Apply multiple price per sales type" checkbox; variant rows with Name, Price, SKU, and an Add Variant button) · *Inventory* (start tracking: In Stock and Alert At; stock can't be edited after saving, so later changes go through Adjustment) · *Cost* (COGS, requires inventory tracking) · *Modifier* (checklist of modifier sets).
- **Modifiers list:** set name, options, and an "Apply Set → Item" action. Your café also uses modifier sets as **combo choices** (a meal set where the customer picks one main and one drink), not only as add-ons like spice level, hot/cold or flavour.
- **Categories:** name, item count, "Assign To Item".
- **Discounts:** name, amount (%), outlet. **Promo:** status filter (Scheduled / Ongoing / Inactive).
- **Sales Type:** name, gratuity applied, status. Your types: Dine In, Take Away, GoFood, GrabFood, ShopeeFood, plus one custom type.
- **Brands:** name and item count.
- **Inventory Summary:** columns Beginning, Purchase Order, Sales, Transfer, Adjustment, Ending. Stock can go **negative** unless "Enable stock limit" is on.
- **Purchase Order:** Simple/Advanced mode, Items/Ingredients toggle, status filter, import/export.
- **Customers list:** Name, Customer Since, spend This Month / This Year / Lifetime. **There's no outlet filter: customers are account-wide.** Loyalty is "One Program for all outlets".
- **Employee Slots:** ID, Name, Role, Assigned Outlet, Outlet Parent, Expiration Date, Type (Free/Paid), Status. Slots are licences (5 free per outlet).
- **Employee Access (roles):** shows the role, the employees assigned, and the access type ("App Only" or "App & Back-office"). Permission checklist:
  - *App:* Manage All Open Bills, Manage Discounts, Issue Refunds, Resend Receipts, Record Invoice Payments, Cancel Invoices, View & Print Current Shift Details, Manage Items, Manage Favorites, Edit Customer Information, Charge Customers, Move Tables.
  - *Backoffice:* one checkbox per page in the sidebar (Dashboard, each report, each library page, ingredients, inventory pages, customers, employee slots, customer display, tables, payments, receipt and email settings).
- **PIN Access:** lists administrators who have PINs, per outlet. Lockable features: Print Bill, Manage All Open Bills, Apply Discounts, Manage Discounts, Issue Refunds, Resend Receipts, Record Invoice Payments, Cancel Invoices, View Shift History, Edit Customer Information, View Activity.
- **Payment Configuration:** named configurations **assigned to outlets**. Groups: Cash, QRIS, Digital Payments, Online Delivery, EDC (card terminals per bank), E-Commerce, Other, Invoice.
- **Outlets list:** name, ID, address, package plan, billing cycle, GoFood link, status.
- **Receipt (per outlet):** logo, outlet info (name, address, city, province, postcode, phone), links (social media), notes (footer), with a **live receipt preview**. The preview shows the receipt layout: header, date/time, receipt no., Served By / Collected By, items with modifiers and per-item promo/discount, Subtotal, Gratuity, Tax, Total, payment, Change, links, note. A second tab, "Sharing Settings", holds the digital receipt options.
- **Checkout settings:** Enable Tax, Enable Gratuity, add vs include tax in price, tax before/after discount per outlet, Enable Rounding, Start Shift Automatically + default starting cash, Enable stock limit (block selling at ≤ 0), Track Server, **Split Payment**, Save Bill & Print Bill.
- **Inventory settings:** Simple vs Advanced for PO and Transfer, set for the whole business.
- **Email notifications:** Daily Sales Summary, Inventory Alerts, Promo Update, and extra verified recipient emails.
- **Reports > Sales:** left sub-menu (Sales Summary, Gross Profit, Payment Methods, Sales Type, Item, Category, Brand, Modifier Sales, Discounts, Taxes, Gratuity, Collected By, Served By). The summary shows Gross Sales − Discounts − Refunds = Net Sales, + Gratuity + Tax + Rounding = Total Collected.
- **Reports > Transactions:** tabs Success Orders / Cancelled Orders / **Void Items**; KPI strip (transactions, total collected, net sales); rows grouped by day (outlet, time, collected by, items, total); receipt-number search.
- **Reports > Shift:** Name, Start, End, Total Expected, Total Actual, Difference; exports for Detail Shift, Detail Expense, Detail Income. Your café runs about 3 shifts a day (≈06:00–13:50, 13:50–20:00, 20:00–00:45).

### How your café actually uses it (sets the MVP priorities)
- About 1,050 transactions in 20 days, ~55 a day, 177 items in 16 categories.
- Payment mix: **QR (BCA QR) ~57%**, **Cash ~33%**, card EDC (BCA, BRI) ~5%, "Other" ~5%, GrabFood a handful.
- Heavily used: item grid + modifiers, sales types, % discounts (staff/owner/holiday), shifts with cash count, transaction and shift reports.
- Not used: taxes, gratuity, promos, bundles, purchase orders, loyalty.

---

## 6. POS app, seen running (Android tablet emulator, 20 Nov 2026, view only)

Moka POS Android on a virtual Pixel Tablet (2560×1600, landscape), logged in to your outlet. Nothing was saved, charged, refunded, started or toggled. I didn't add items to the cart or open live open bills, so the item-options popup and the payment sheet below come from Moka's official store screenshots.

### Navigation
Hamburger (bottom-left) opens a left drawer: **Point of Sale · Online Orders · Activity · Inventory · Shift · Settings**. The bottom bar shows the outlet name on most screens. On the POS screen it becomes tabs: **Favorites · Library · Custom**.

### Point of Sale (main screen): two panes
- **Left pane, catalog:**
  - Search bar.
  - Library root lists *Discounts*, *All Items*, *All Bundle Packages*, then one row per category, each with a 2-letter initials tile when there's no photo.
  - Drilling in shows a back arrow and a count ("All Items · 177 Items"); rows are image/initials, name and price ("Variable" for variants, "Sales Type" for per-type pricing).
  - Pencil icon = quick library edit.
- **Favorites tab:** a user-pinned grid (empty here). **Custom tab:** a numeric keypad (1–9, 0, 00, C, Del) and a "+" button to add an open-price line.
- **Right pane, cart:**
  - Top: **Billing List** icon and **+ Add Customer**; below that the **sales type selector** ("Dine In ▾"). It opens a sheet with Cancel / Done and a two-column grid of sales types.
  - Middle: cart lines, then Sub-Total, tax lines, Total, and "Clear Sale".
  - Bottom: **Save Bill | Print Bill**, then a large **Charge Rp X** button with a small **Split Bill** button beside it.
- **Item options popup** (store screenshots): quantity, variant, modifiers, discount, note.
- **Payment sheet** (store screenshots):
  - Header: Cancel, the amount and a Charge button.
  - Payment rows grouped by type: **Cash** (exact amount and suggested round-up amounts, or type one), **Card/EDC**, **E-Wallet/QR**, **Online Delivery** (GoFood, GrabFood, ShopeeFood, Other), **Other**, **Invoice**.
  - Done screen: a big check mark, the total, Email receipt and SMS receipt fields with Send, **Print Receipt**, and **New Sale**.

### Billing Management (open bills)
Full-screen modal: Close · "Billing Management" · **New Bill**. Tabs:
- **Open Bills:** search; columns Billing Name, Table Group, Server, Time (age, e.g. "51 min"), Sync. Bills are named by table number or place (e.g. "11", "sofa").
- **Cancelled Bills:** Cancelled Time, Billing Name, Cancelled By, Order ID.
- **Item Void:** Void Time, Item Name, Qty, Void By, **Void Reason** (e.g. "Out of stock"), Order ID.

Removing an item from a saved bill is a logged **void with a reason**. That's an anti-fraud audit trail worth copying.

### Activity (sales history): master–detail
- **Left:** search by "Receipt or Invoice Number"; list grouped by day (TODAY …); each row shows a payment-type icon, total, time, and a one-line item summary.
- **Right:** **Send Receipt** and **Issue Refund** buttons.
  - DETAILS: payment method, receipt number (short code like "1O50DK"), time of purchase.
  - ITEMS: grouped under the sales type; modifiers show on their own line as "[Suhu] Dingin  Rp 0".
  - Totals: Subtotal, Total, Tendered, Change.
- **Issue Refund needs an open shift on this device.** Without one, it pops up "Start Shift" with the starting cash prefilled.

### Shift
- Left menu: **Shift Option** (automatic shift on/off, default starting cash Rp 1,000,000), **Current Shift**, **Shift History**.
- Shift History lists the start–end range for each shift. Shift Details:
  - **Print Summary Shift Report**.
  - SHIFT DETAILS: name, outlet, start, end.
  - ORDER DETAILS: sold items, refunded items; Moka-Order delivery counts.
  - **CASH:** Starting Cash, Cash Sales, Cash from Invoice, Cash Refunds, Expense/Income, **Expected Ending Cash, Actual Ending Cash, Cash Differences**.
  - **DIGITAL PAYMENTS:** per QR provider, refunds, expected.
  - **EDC:** per bank, refunds, expected.
  - **TOTAL Expected.**

### Inventory (app)
Read-only stock table: Item Library/Ingredients picker, search; columns Item Name, Variant, **In Stock**, **Stock Alert** (Low / Out).

### Online Orders
- Left: search (order ID, driver or customer), filters for Show (status) and Shipping Method.
- Right: action bar (Print, **Reject Order**, **Accept Order**, "Looking for Driver…"), Print Order Ticket / Sticker Label, and tabs for Order Details and Delivery Details.

### Settings (app)
Device and outlet header (name, login email, outlet). Sections:
- **Online ordering:** receive online orders on this device; notification sound.
- **Checkout:** Payments (e-wallet activation), Taxes (Off), Gratuity (Off), Checkout Settings (tax mode, Track Server).
- **Hardware:** Printer (scan for Bluetooth/LAN printers, Refresh), Barcode Scanners, GoBiz PLUS EDC, Customer Display.
- **Account:** Language, Profile, Support, **Logout**.

### Design takeaways for your app
- Copy the two-pane tablet layout (catalog left, cart right, Charge bottom-right), but give the catalog a **photo/tile grid** instead of Moka's text list. That's faster to tap, and Favorites already works this way.
- Keep: sales-type sheet; named open bills with age timers; mandatory void reasons; master–detail Activity; refunds tied to the open shift; a shift close-out with expected vs actual per payment type.
- Moka's weak spots to improve: the drill-down category list (extra taps), 2-letter initials instead of images, a plain list catalog, and settings split between the app and the backoffice.
