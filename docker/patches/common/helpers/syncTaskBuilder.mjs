import path from 'node:path';

export function buildConfigSyncTasksFrom(cfg, { version = '13', dataDir = '/data/Data' } = {}) {
  const versionCfg = cfg && cfg.versions && cfg.versions[version] && cfg.versions[version].install;
  if (!versionCfg) return [];
  const tasks = [];
  const handleKind = (kind) => {
    const entries = versionCfg[kind] || {};
    for (const [id, overrides] of Object.entries(entries)) {
      const top = (cfg[kind] && cfg[kind][id]) || {};
      const merged = { ...top, ...overrides };
      const cs = merged.continuous_sync;
      let enabled = false;
      let direction;
      let source;
      let del;
      let interval;
      if (typeof cs === 'boolean') {
        enabled = cs;
      } else if (cs && typeof cs === 'object') {
        enabled = cs.enabled !== undefined ? !!cs.enabled : true;
        direction = cs.direction;
        source = cs.source;
        del = cs.delete;
        interval = cs.interval;
      }
      if (!enabled) continue;
      if (!direction) direction = (kind === 'worlds') ? 'host-to-container' : 'bidirectional';
      if (!source) {
        if (kind === 'worlds') source = `/host/shared/worlds/${id}`;
        else if (kind === 'modules') source = `/host/resources/modules/${id}`;
        else source = `/host/resources/systems/${id}`;
      }
      if (del == null) del = (kind === 'worlds') ? false : true;
      const dest = path.join(dataDir, kind, id);
      tasks.push({ kind, id, direction, source, dest, deletePolicy: del ? 'delete' : 'keep', interval: Number(interval) || 0 });
    }
  };
  handleKind('worlds');
  handleKind('modules');
  handleKind('systems');
  return tasks;
}
