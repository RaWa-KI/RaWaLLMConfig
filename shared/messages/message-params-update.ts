export type UpdateMessageParamsMap = {
  "update.loadingStatus": undefined
  "update.unconfiguredHint": undefined
  "update.retryCheck": undefined
  "update.title": undefined
  "update.versionPrefix": { sourceLabel: string }
  "update.idleTitle": undefined
  "update.sourceStatus.localKnown": { version: string }
  "update.sourceStatus.lastSuccess": { checkedAt: string }
  "update.sourceStatus.neverChecked": undefined
  "update.sourceStatus.noFreshResult": undefined
  "update.sourceError.title": undefined
  "update.sourceError.detail": { sourceLabel: string }
  "update.check": undefined
  "update.availableLabel": undefined
  "update.currentVersion": { version: string }
  "update.download": undefined
  "update.downloadProgress": undefined
  "update.progressBytes": { copied: string; total: string; percentage: string }
  "update.readyBadge": undefined
  "update.readyTitle": undefined
  "update.installerReady": undefined
  "update.install": undefined
  "update.unknownError": undefined
  "update.checking": undefined
  "update.restarting": undefined
  "update.dialog.downloadTitle": undefined
  "update.dialog.downloadDetail": { version: string }
  "update.dialog.downloadConfirm": undefined
  "update.dialog.installTitle": undefined
  "update.dialog.installDetail": undefined
  "update.dialog.installConfirm": undefined
  "update.toast.bridgeUnavailable": undefined
  "update.toast.checkComplete": undefined
  "update.toast.noUpdateAvailable": undefined
  "update.toast.downloaded": undefined
  "update.toast.installStarted": undefined
  "update.toast.actionFailed": undefined
  "update.toast.bridgeError": undefined
  "update.watcher.title": undefined
  "update.watcher.subtitle": { sourceCount: string; tokens: string; updated: string }
  "update.watcher.daemon": undefined
  "update.watcher.sources": undefined
  "update.watcher.signals": undefined
  "update.watcher.tiers": undefined
  "update.watcher.sourcesTitle": undefined
  "update.watcher.all": undefined
  "update.watcher.emptySources": undefined
  "update.watcher.historyTitle": undefined
  "update.watcher.entryCount": { count: string }
  "update.watcher.changelogTitle": undefined
  "update.watcher.localStored": undefined
  "update.watcher.emptyChangelog": undefined
  "update.watcher.state.current": undefined
  "update.watcher.state.recent": undefined
  "update.watcher.state.update": undefined
  "update.watcher.state.gated": undefined
  "update.watcher.state.flag": undefined
  "update.watcher.installed": undefined
  "update.watcher.targetVersion": undefined
  "update.watcher.tierBadge": { tier: string }
  "update.watcher.bridgeUnavailable": undefined
  "update.watcher.fulltextUnavailable": undefined
  "update.watcher.loadError": undefined
  "update.watcher.close": undefined
  "update.watcher.fulltext": undefined
  "update.watcher.live": undefined
  "update.watcher.static": undefined
  "update.watcher.lastResult": { lastResult: string }
  "update.watcher.daemonSchedule": undefined
}
