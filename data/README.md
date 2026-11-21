# Menu data

`djoeragan-kopitiam-menu.csv`: the Djoeragan Kopitiam printed menu (93 items, 10 categories), typed up from a photo of the menu sheet.

- Columns: `Name, Category, Variant, Price, SKU, Description, Choices`. Prices are in rupiah and, per the menu, already include PB1.
- "(Panas / Dingin)" items are listed without that suffix and with `Choices = Suhu` (the hot/cold choice); Soto Ayam / Soto Daging use `Choices = Kuah` (Bening / Santan).
- Backoffice → Library → **Import CSV** reads Name, Category, Variant, Price, SKU and Description; it skips items whose name already exists and does not attach choices (add those in Edit menu or the item editor).
- Check prices against the current printed menu before going live; a few were hard to read in the photo.
