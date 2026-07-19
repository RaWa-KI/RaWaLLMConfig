// memoLast (Teilplan C): Memoisiert den letzten Aufruf einer reinen Funktion.
// Die Argumente werden elementweise per Object.is verglichen; bei Gleichheit
// kommt die letzte Ergebnis-Referenz zurueck, ohne die Funktion erneut zu
// rechnen. Voraussetzung: flache, referenzstabile Argumente — keine frisch
// erzeugten Arrays/Objekte als Aufruf-Argumente, sonst faengt der Cache nichts.
export function memoLast<Args extends readonly unknown[], R>(
  fn: (...args: Args) => R
): (...args: Args) => R {
  let lastArgs: readonly unknown[] | null = null
  let lastResult: R | undefined
  return (...args: Args): R => {
    const prev = lastArgs
    if (
      prev !== null &&
      prev.length === args.length &&
      args.every((arg, index) => Object.is(arg, prev[index]))
    ) {
      return lastResult as R
    }
    const result = fn(...args)
    lastArgs = args
    lastResult = result
    return result
  }
}
