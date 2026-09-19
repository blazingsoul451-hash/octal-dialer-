import type { Express, RequestHandler } from 'express';
import path from 'path';
import * as scraper from './googleMapsScraperService';

export function registerScraperRoutes(app: Express, requireAuth: RequestHandler, io: any,
  service: typeof scraper = scraper): void {
  service.setScraperSocketBroadcaster(io);
  const tenant: RequestHandler = (req, res, next) => {
    if (!(req as any).user?.tenantId) {
      res.status(401).json({ error: 'Missing tenant identity.' });
      return;
    }
    next();
  };
  const errorResponse = (res: any, err: unknown) => {
    const message = err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message : 'Scraper request failed.';
    const status = /Forbidden|Unauthorized/.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  };
  app.get('/api/scraper-files', requireAuth, tenant, (req, res) => {
    try { res.json(service.listTenantScraperFiles((req as any).user.tenantId)); }
    catch (err) { errorResponse(res, err); }
  });
  app.get('/api/scraper-files/download/:filename', requireAuth, tenant, (req, res) => {
    try {
      const name = req.params.filename;
      if (path.basename(name) !== name || /[\\/]/.test(name)) throw new Error('Forbidden filename.');
      const file = service.validateTenantFileAccess((req as any).user.tenantId,
        path.join(service.getTenantOutputDir((req as any).user.tenantId), name));
      res.download(file, name);
    } catch (err) { errorResponse(res, err); }
  });
  app.post('/api/scraper-files/import', requireAuth, tenant, async (req, res) => {
    try {
      const { filePath, campaignName = '' } = req.body;
      if (typeof filePath !== 'string' || !filePath || typeof campaignName !== 'string') {
        res.status(400).json({ error: 'A file path and valid campaign name are required.' });
        return;
      }
      const user = (req as any).user;
      const result = await service.importScraperFileToCampaign(filePath, campaignName, user.tenantId, user.username);
      io.to(`tenant_${user.tenantId}`).emit('leads:updated');
      io.to(`tenant_${user.tenantId}`).emit('campaigns:updated');
      res.json({ ...result, count: result.importedCount, name: result.name });
    } catch (err) { errorResponse(res, err); }
  });
  app.post('/api/scraper/run', requireAuth, tenant, async (req, res) => {
    try {
      const { keyword, location = '', maxLeads = 50, requirePhone = false,
        requireEmail = false, enrichWebsite = false } = req.body;
      const limit = Number(maxLeads);
      if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 250 ||
          typeof location !== 'string' || location.length > 250 ||
          !Number.isInteger(limit) || limit < 1 || limit > 1000 ||
          [requirePhone, requireEmail, enrichWebsite].some(value => typeof value !== 'boolean')) {
        res.status(400).json({ error: 'Invalid scraper options (lead limit: 1-1000).' });
        return;
      }
      const user = (req as any).user;
      const result = await service.submitScraperJob({ keyword: keyword.trim(), location: location.trim(),
        maxLeads: limit, requirePhone, requireEmail, enrichWebsite: enrichWebsite || requireEmail,
        tenantId: user.tenantId, username: user.username });
      res.status(result.success ? 202 : 409).json({ ...result, error: result.success ? undefined : result.message });
    } catch (err) { errorResponse(res, err); }
  });
  app.get('/api/scraper/status', requireAuth, tenant, (req, res) => {
    try {
      if (req.query.jobId !== undefined && typeof req.query.jobId !== 'string') {
        res.status(400).json({ error: 'Invalid job ID.' }); return;
      }
      const job = service.getTenantScraperStatus((req as any).user.tenantId, req.query.jobId as string | undefined);
      if (!job && req.query.jobId) { res.status(404).json({ error: 'Job not found.' }); return; }
      res.json(job || { status: 'idle', logs: [] });
    } catch (err) { errorResponse(res, err); }
  });
  app.post('/api/scraper/stop', requireAuth, tenant, async (req, res) => {
    try {
      const { jobId } = req.body;
      if (typeof jobId !== 'string' || !jobId) {
        res.status(400).json({ error: 'Job ID is required.' }); return;
      }
      const tenantId = (req as any).user.tenantId;
      const stopped = await service.stopTenantScraperJob(tenantId, jobId);
      if (!stopped) { res.status(404).json({ error: 'Active job not found.' }); return; }
      res.json({ success: true, jobId, status: service.getTenantScraperStatus(tenantId, jobId)?.status });
    } catch (err) { errorResponse(res, err); }
  });
}
