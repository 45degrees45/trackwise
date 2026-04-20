# DASHBOARD Sheet — Formula Reference

All formulas reference the `TIME_LOG` sheet. Paste them into the `DASHBOARD` sheet tab.

---

## Section 1: Today Stats (Rows 1–4)

| Cell | Label | Formula |
|------|-------|---------|
| A1 | Tasks Today | `=COUNTIFS(TIME_LOG!D:D,TEXT(TODAY(),"yyyy-mm-dd"))` |
| B1 | Tasks This Week | `=COUNTIFS(TIME_LOG!H:H,WEEKNUM(TODAY()),TIME_LOG!K:K,YEAR(TODAY()))` |
| C1 | Tasks This Month | `=COUNTIFS(TIME_LOG!J:J,MONTH(TODAY()),TIME_LOG!K:K,YEAR(TODAY()))` |
| A2 | Peak Hour | `=LET(hours,QUERY(TIME_LOG!F:F,"SELECT F, COUNT(F) WHERE F IS NOT NULL GROUP BY F ORDER BY COUNT(F) DESC LIMIT 1",0),IF(ROWS(hours)=0,"—",TEXT(IFERROR(INDEX(hours,1,1),0),"00")&":00"))` |
| A3 | Day Streak | `=LET(dates,SORT(UNIQUE(FILTER(TIME_LOG!D:D,TIME_LOG!D:D<>"")),1,-1),streak,IFNA(MATCH(FALSE,MMULT((SEQUENCE(30,1,0,1)=TRANSPOSE(TODAY()-DATEVALUE(dates))),SEQUENCE(COLUMNS(TRANSPOSE(TODAY()-DATEVALUE(dates))),1,1,0))>0,0)-1,0),streak)` |

---

## Section 2: Recent Completions (Rows 6–16)

| Cell | Content |
|------|---------|
| A6 | `RECENT COMPLETIONS` (label, no formula) |
| A7 | `=IFERROR(SORT(FILTER(TIME_LOG!B:E,TIME_LOG!D:D<>""),3,FALSE,4,FALSE),"No data yet")` |

This formula spills — it fills rows 7–16 automatically with the 10 most recent completions sorted by date+time descending. Do not put anything in A8:E16.

---

## Section 3: Weekly Hour Heatmap (Rows 18–21)

**Row 18:** Label — type `TASKS BY HOUR — THIS WEEK`

**Row 19:** Hour labels in B19:O19 — type these values manually:
`6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19`

**Row 20:** Count formulas in B20:O20. In B20, paste:
```
=COUNTIFS(TIME_LOG!F:F,B19,TIME_LOG!D:D,">="&TEXT(TODAY()-WEEKDAY(TODAY(),2)+1,"yyyy-mm-dd"))
```
Then copy B20 across to O20 (it will pick up C19, D19, etc. automatically).

**Conditional Formatting for B20:O20:**
- Select B20:O20
- Format → Conditional formatting → Color scale
- Min value: white (`#FFFFFF`)
- Max value: dark green (`#166534`)

---

## Section 4: Monthly Day Heatmap (Rows 23–30)

**Row 23:** Label — paste:
```
="MONTHLY HEATMAP — "&TEXT(TODAY(),"MMMM YYYY")
```

**Row 24:** Day-of-week headers in B24:H24 — type manually: `Su, Mo, Tu, We, Th, Fr, Sa`

**Rows 25–30:** Calendar grid — B25:H30 (6 rows × 7 columns = 42 cells for a full month).

In B25 (first calendar cell), paste:
```
=DATE(YEAR(TODAY()),MONTH(TODAY()),1)-WEEKDAY(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1)+1
```

In C25, paste: `=B25+1`
Copy C25 across to H25, then copy row 25 down to row 30 (each row adds 7 days).

Now add a count overlay in a parallel range B31:H36 (or use conditional formatting directly on B25:H30):

For each date cell, the conditional formatting formula (applied to B25:H30) uses:
```
=AND(MONTH(B25)=MONTH(TODAY()),COUNTIFS(TIME_LOG!D:D,TEXT(B25,"yyyy-mm-dd"))>0)
```

**Simpler approach — show counts directly:**
In a separate range B31:H36, paste in B31:
```
=IF(MONTH(B25)=MONTH(TODAY()),COUNTIFS(TIME_LOG!D:D,TEXT(B25,"yyyy-mm-dd")),"")
```
Copy across and down. Apply the green color scale conditional formatting to B31:H36.

---

## Section 5: Yearly Month Heatmap (Rows 33–35)

**Row 33:** Label — paste:
```
="YEARLY HEATMAP — "&YEAR(TODAY())
```

**Row 34:** Month labels in B34:M34 — type manually: `Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec`

**Row 35:** Count formulas in B35:M35. In B35, paste:
```
=COUNTIFS(TIME_LOG!J:J,1,TIME_LOG!K:K,YEAR(TODAY()))
```
In C35: change `1` to `2`. In D35: `3`. Continue through M35 with `12`.
(These cannot be auto-filled — change the month number manually for each cell.)

**Conditional Formatting for B35:M35:**
- Select B35:M35
- Format → Conditional formatting → Color scale
- Min: white, Max: dark green `#166534`

**Highlight current month:** Add a custom formula rule on B35:M35:
```
=COLUMN(B35)-COLUMN($B$35)+1=MONTH(TODAY())
```
Set border or background to highlight the current month.
