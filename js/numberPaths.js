// x: 0 (links) bis 100 (rechts), y: 0 (Oberkante) bis 100 (Grundlinie) -
// Ziffern haben (anders als Buchstaben, siehe letterPaths.js) keine
// Ober-/Unterlängen, daher eine reine 100x100-Box statt 100x132.
// Befehle: ['M',x,y] Stift aufsetzen, ['L',x,y] Linie, ['Q',cx,cy,x,y] quadratische Kurve.
export const NUMBER_PATHS = {
  0: { strokes: [
    [['M', 50, 4], ['Q', 14, 4, 14, 50], ['Q', 14, 96, 50, 96], ['Q', 86, 96, 86, 50], ['Q', 86, 4, 50, 4]]
  ] },
  1: { strokes: [
    [['M', 30, 20], ['L', 50, 4], ['L', 50, 100]]
  ] },
  2: { strokes: [
    [['M', 14, 26], ['Q', 14, 4, 50, 4], ['Q', 86, 4, 86, 28], ['Q', 86, 50, 50, 74], ['L', 14, 100], ['L', 86, 100]]
  ] },
  3: { strokes: [
    [['M', 16, 16], ['Q', 50, 0, 74, 18], ['Q', 90, 32, 60, 50], ['Q', 90, 66, 74, 84], ['Q', 50, 100, 16, 86]]
  ] },
  4: { strokes: [
    [['M', 64, 4], ['L', 16, 68], ['L', 92, 68]],
    [['M', 70, 4], ['L', 70, 100]]
  ] },
  5: { strokes: [
    [['M', 84, 4], ['L', 20, 4], ['L', 16, 46], ['Q', 50, 34, 76, 50], ['Q', 96, 64, 76, 86], ['Q', 52, 100, 18, 86]]
  ] },
  6: { strokes: [
    [['M', 76, 8], ['Q', 20, 4, 14, 50], ['Q', 10, 96, 54, 96], ['Q', 92, 96, 88, 68], ['Q', 84, 44, 50, 46], ['Q', 22, 48, 24, 70]]
  ] },
  7: { strokes: [
    [['M', 14, 4], ['L', 88, 4], ['L', 38, 100]]
  ] },
  8: { strokes: [
    [['M', 50, 4], ['Q', 24, 4, 24, 24], ['Q', 24, 44, 50, 48], ['Q', 80, 52, 80, 74], ['Q', 80, 98, 50, 98], ['Q', 20, 98, 20, 74], ['Q', 20, 52, 50, 48], ['Q', 76, 44, 76, 24], ['Q', 76, 4, 50, 4]]
  ] },
  9: { strokes: [
    [['M', 52, 4], ['Q', 18, 4, 18, 26], ['Q', 18, 48, 52, 48], ['Q', 86, 48, 86, 26], ['Q', 86, 4, 52, 4]],
    [['M', 86, 26], ['Q', 86, 70, 50, 100]]
  ] }
};

// Ziffern haben keine Ober-/Unterlängen (siehe Kommentar oben) - anders als
// LETTER_PATH_BOX (100x132) bleibt hier alles innerhalb einer 100x100-Box.
export const NUMBER_PATH_BOX = { width: 100, height: 100 };
