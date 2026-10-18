# Toggi Toys: product import

`toggitoys-products.csv` holds all 283 products from toggitoys.com (WooCommerce), in Shopify's import format. Each product has its real photos, BDT prices and sale prices, descriptions and SKUs.

This folder is not part of the theme. `.shopifyignore` keeps it out of `shopify theme push`.

## 1. Import the products

1. Shopify admin › **Products › Import** › choose `toggitoys-products.csv`.
2. Keep toggitoys.com online until the import finishes. Shopify downloads every photo from it.

| Product status | Count | Why |
|---|---|---|
| Active | 46 | In stock on the old site. Stock isn't tracked yet, so set real quantities. |
| Draft | 237 | Out of stock on the old site (stock = 0). Set them to Active when restocked. |

## 2. Create collections

Go to **Products › Collections › Create collection**, pick **Automated**, and use the condition **Product tag is equal to** the tag below. The homepage expects the handle shown, which Shopify creates from the title.

### Homepage collections

| Title | Handle | Tag |
|---|---|---|
| New Arrivals | `new-arrivals` | `new-arrival` |
| Best Sellers | `best-sellers` | `best-seller` |
| Big Deals | `big-deals` | `big-deals` |

### Shop by age

| Title | Handle | Tag |
|---|---|---|
| 0–12 Months | `age-0-12-months` | `age-0-12-months` |
| 1–3 Years | `age-1-3-years` | `age-1-3-years` |
| 3–5 Years | `age-3-5-years` | `age-3-5-years` |
| 5–8 Years | `age-5-8-years` | `age-5-8-years` |
| 8+ Years | `age-8-plus` | `age-8-plus` |

### Categories

For each category, the tag is the category name exactly as written below.

| Title / tag | Handle | Products |
|---|---|---|
| Ride-Ons & Vehicles | `ride-ons-vehicles` | 62 |
| Building & Construction Toys | `building-construction-toys` | 39 |
| Pretend Play & Role Play | `pretend-play-role-play` | 33 |
| Animals & Nature-Inspired Toys | `animals-nature-inspired-toys` | 25 |
| Dolls & Accessories | `dolls-accessories` | 24 |
| Sports & Outdoor Play | `sports-outdoor-play` | 24 |
| Musical Toys | `musical-toys` | 21 |
| Baby & Toddler Toys | `baby-toddler-toys` | 17 |
| Action Figures & Hero Toys | `action-figures-hero-toys` | 11 |
| Art & DIY Toys | `art-diy-toys` | 10 |
| Furniture & Play Accessories | `furniture-play-accessories` | 8 |
| Learning & Educational Toys | `learning-educational-toys` | 6 |

## 3. Connect the homepage

In the theme editor, pick each collection in its homepage section, or ask for the handles to be filled into `templates/index.json`.

## Notes

- **Big Deals** has only 2 products, because only 2 of the 29 sale items are in stock. Add the `big-deals` tag to more products to fill it.
- **New Arrivals and Best Sellers** are the 16 newest and 16 most popular in-stock products. Edit the tags anytime to change them.
- **Short descriptions:** product cards use the start of each description. For hand-written short descriptions, create a product metafield `custom.short_description` (single-line text).
