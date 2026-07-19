export type OverviewMessageParamsMap = {
  "overview.title": undefined
  "overview.readySummary": { readyCount: string; totalCount: string }
  "overview.warningSummary": { warningCount: string }
  "overview.warningSummary.one": undefined
  "overview.warningSummary.many": { topicCount: string }
  "overview.status.ready": { totalCount: string }
  "overview.status.partial": { readyCount: string; totalCount: string }
  "overview.status.incomplete": { readyCount: string; totalCount: string }
  "overview.stamp.allClear": undefined
  "overview.stamp.attention": { count: string }
  "overview.metric.openTopics.none": undefined
  "overview.metric.openTopics.some": { topics: string }
  "overview.metric.setup.ready": undefined
  "overview.metric.setup.needed": { count: string; total: string }
  "overview.readiness.state.ready": undefined
  "overview.readiness.state.incomplete": undefined
  "overview.readiness.state.warning": { count: string }
  "overview.topic.config": undefined
  "overview.topic.system": undefined
  "overview.topic.watcher": undefined
  "overview.topic.appErrors": undefined
  "overview.nextAction": undefined
  "overview.expertEntry": undefined
  "overview.zone.areaPaths": undefined
  "help.nav.title": undefined
  "help.mode.simple": undefined
  "help.mode.expert": undefined
  "tasks.setup.title": undefined
  "tasks.setup.body": undefined
  "tasks.setup.term": undefined
  "tasks.setup.meaning": undefined
  "tasks.setup.expertTarget": undefined
  "tasks.check.title": undefined
  "tasks.check.body": undefined
  "tasks.check.term": undefined
  "tasks.check.meaning": undefined
  "tasks.check.expertTarget": undefined
  "tasks.change.title": undefined
  "tasks.change.body": undefined
  "tasks.change.term": undefined
  "tasks.change.meaning": undefined
  "tasks.change.expertTarget": undefined
  "tasks.restore.title": undefined
  "tasks.restore.body": undefined
  "tasks.restore.term": undefined
  "tasks.restore.meaning": undefined
  "tasks.restore.expertTarget": undefined
  "tasks.expert.title": undefined
  "tasks.expert.body": undefined
  "tasks.expert.term": undefined
  "tasks.expert.meaning": undefined
  "tasks.expert.expertTarget": undefined
  "tasks.card.status": { status: string }
  "simpleMode.label": undefined
  "simpleMode.showDetails": undefined
  "simpleMode.hideDetails": undefined
  "simpleMode.backupHint": undefined
  "simpleMode.riskHint": undefined
  "simpleMode.switchGroup": undefined
  "expertDetails.label": undefined
  "expertDetails.primaryTerm": { term: string }
  "expertDetails.meaning": { meaning: string }
  "expertDetails.technicalName": { term: string }
  "expertDetails.rawTarget": { target: string }
  "expertDetails.rawDetails": undefined
  "expertDetails.glossary.provider.primary": undefined
  "expertDetails.glossary.provider.expert": undefined
  "expertDetails.glossary.mcp.primary": undefined
  "expertDetails.glossary.mcp.expert": undefined
  "expertDetails.glossary.hook.primary": undefined
  "expertDetails.glossary.hook.expert": undefined
  "expertDetails.glossary.registry.primary": undefined
  "expertDetails.glossary.registry.expert": undefined
  "expertDetails.glossary.shared.primary": undefined
  "expertDetails.glossary.shared.expert": undefined
  "expertDetails.glossary.endpoint.primary": undefined
  "expertDetails.glossary.endpoint.expert": undefined
  "expertDetails.glossary.config.primary": undefined
  "expertDetails.glossary.config.expert": undefined
  "diagnostics.card.title": undefined
  "diagnostics.card.summary": { status: string }
  "diagnostics.card.meaning": { issue: string }
  "diagnostics.card.nextStep": { action: string }
  "diagnostics.card.viewDetails": undefined
  "diagnostics.card.openInExpert": undefined
  "diagnostics.row.toggle": undefined
  "diagnostics.panel.title": undefined
  "diagnostics.panel.intro": undefined
  "diagnostics.panel.more": { hiddenCount: string }
  "coverage.panel.title": undefined
  "coverage.panel.intro": undefined
  "coverage.filter.onDemand": undefined
  "coverage.filter.confirmed": undefined
  "coverage.filter.all": undefined
  "coverage.badge.onDemand": undefined
  "coverage.badge.confirmed": undefined
  "coverage.more": undefined
  "coverage.confirmed.simpleLine": { count: string }
  "coverage.action.ack": undefined
  "coverage.action.ackError": undefined
  "coverage.action.ackDisabled": undefined
  "diagnostics.severity.info": undefined
  "diagnostics.severity.warning": undefined
  "diagnostics.severity.error": undefined
  "diagnostics.status.notConfigured": undefined
  "diagnostics.status.notFound": undefined
  "diagnostics.status.unavailable": undefined
  "diagnostics.status.paused": undefined
  "diagnostics.status.problemFound": undefined
  "diagnostics.status.notUsable": undefined
  "diagnostics.title.notConfigured": undefined
  "diagnostics.title.notFound": undefined
  "diagnostics.title.unavailable": undefined
  "diagnostics.title.paused": undefined
  "diagnostics.title.problemFound": undefined
  "diagnostics.title.notUsable": undefined
  "diagnostics.meaning.notConfigured": undefined
  "diagnostics.meaning.notFound": undefined
  "diagnostics.meaning.unavailable": undefined
  "diagnostics.meaning.paused": undefined
  "diagnostics.meaning.problemFound": undefined
  "diagnostics.meaning.notUsable": undefined
  "diagnostics.action.notConfigured": undefined
  "diagnostics.action.notFound": undefined
  "diagnostics.action.unavailable": undefined
  "diagnostics.action.paused": undefined
  "diagnostics.action.problemFound": undefined
  "diagnostics.action.notUsable": undefined
  "diagnostics.source.config": undefined
  "diagnostics.source.system": undefined
  "diagnostics.source.watcher": undefined
  "diagnostics.source.appErrors": undefined
  "diagnostics.detail.source": { source: string }
  "diagnostics.target.unknown": { source: string }
  "diagnostics.focus.title": undefined
  "diagnostics.focus.target": { target: string }
  "guidedFlows.firstStart.title": undefined
  "guidedFlows.firstStart.body": undefined
  "guidedFlows.firstStart.target": undefined
  "guidedFlows.firstStart.step.one": undefined
  "guidedFlows.firstStart.step.two": undefined
  "guidedFlows.firstStart.step.three": undefined
  "guidedFlows.firstStart.step.four": undefined
  "guidedFlows.checkProblem.title": undefined
  "guidedFlows.checkProblem.body": undefined
  "guidedFlows.checkProblem.target": undefined
  "guidedFlows.checkProblem.step.one": undefined
  "guidedFlows.checkProblem.step.two": undefined
  "guidedFlows.checkProblem.step.three": undefined
  "guidedFlows.checkProblem.step.four": undefined
  "guidedFlows.prepareChange.title": undefined
  "guidedFlows.prepareChange.body": undefined
  "guidedFlows.prepareChange.target": undefined
  "guidedFlows.prepareChange.step.one": undefined
  "guidedFlows.prepareChange.step.two": undefined
  "guidedFlows.prepareChange.step.three": undefined
  "guidedFlows.prepareChange.step.four": undefined
  "guidedFlows.activateModule.title": undefined
  "guidedFlows.activateModule.body": undefined
  "guidedFlows.activateModule.target": undefined
  "guidedFlows.activateModule.step.one": undefined
  "guidedFlows.activateModule.step.two": undefined
  "guidedFlows.activateModule.step.three": undefined
  "guidedFlows.activateModule.step.four": undefined
  "guidedFlows.title": undefined
  "guidedFlows.intro": undefined
  "guidedFlows.selectHint": undefined
  "guidedFlows.symptomTitle": undefined
  "guidedFlows.cancel": undefined
  "guidedFlows.backToDetails": { target: string }
  "guidedFlows.stepCount": { current: string; total: string }
}
