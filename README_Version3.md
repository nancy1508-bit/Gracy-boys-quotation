```markdown
# Gracy Boys Quotation App

Simple quotation maker and dashboard for an event company using the Chennai "GRACY BOY'S" letterpad.

Features:
- 3-column quotation rows: Requirements, Amount, Remark.
- Total automatically calculated from the Amount column.
- Save quotations (stored in db.json).
- Dashboard to view, edit, delete and download each quotation as PDF.
- Editable quotations: load a saved quotation into the editor and update it.

Setup:
1. Place your Chennai Gracy Boys letter pad image at: `public/letterpad.png`
   - Recommended image width: ~1200px for good PDF quality.
   - Filename must be `letterpad.png` unless you change the HTML.

2. Install dependencies:
   ```
   npm install
   ```

3. Start the app:
   ```
   npm start
   ```

4. Open in browser:
   - Editor: http://localhost:3000/
   - Dashboard: http://localhost:3000/dashboard.html

Notes:
- Quotations are stored in `db.json` in the repo root.
- PDF generation is done client-side (html2pdf), so the layout printed/downloaded will include the letter pad image at the top.
- For production, consider adding authentication and a proper database.
```