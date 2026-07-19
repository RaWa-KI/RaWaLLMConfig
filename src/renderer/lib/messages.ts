export { msg, msgText, msgMode, isMessageKey } from '@shared/messages'
export type { MessageKey, MessageParamsMap, MessageMode } from '@shared/messages'

// msgMode (Teil E): DisplayMode-Projektion der Texte — 'simple' loest `<key>.simple`
// auf, 'expert' `<key>.expert`; fehlt die Variante, gilt der Basis-Key. DisplayMode
// (state/types.ts) ist deckungsgleich mit MessageMode ('simple' | 'expert'), daher
// reicht der Re-Export direkt neben msg/msgText. Kern-Logik + Kataloge: @shared/messages.
