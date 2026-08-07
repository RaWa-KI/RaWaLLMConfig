// diagnosis-cat.ts — Pseudo-Kategorie „Diagnose“ (WP3, 2026-07-28). Sie ist
// KEINE Scan-Kategorie, sondern ein eigener Sidebar-Menuepunkt der Config-
// Sektion OBERHALB der echten Kategorien: die dauerhaften Diagnosekarten
// (Overview-Modell) bekommen damit einen festen Ort mit Anzahl-Badge.
// Die id muss kollisionsfrei zu allen Scan-Kategorie-ids bleiben und wird
// vom Default-Kategorie-Guard als gueltige Auswahl akzeptiert.
export const DIAGNOSIS_CAT_ID = 'diagnose'
