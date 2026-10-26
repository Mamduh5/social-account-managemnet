import { Router } from 'express';
import { calendarService } from '../services/calendar.service.js';

export const calendarRouter = Router();

const wrap = (fn: any) => (req: any, res: any, next: any) =>
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((e: any) =>
      res.status(e.message?.includes('migration') ? 503 : 400).json({ error: e.message || 'Request failed' })
    );

calendarRouter.get(
  '/health',
  wrap((_req: any, res: any) => {
    res.json(calendarService.getHealth());
  })
);

calendarRouter.get(
  '/campaigns',
  wrap((req: any, res: any) => {
    const accountId = req.query.accountId as string | undefined;
    res.json({ campaigns: calendarService.getCampaigns(accountId) });
  })
);

calendarRouter.get(
  '/campaigns/:id',
  wrap((req: any, res: any) => {
    res.json({ campaign: calendarService.getCampaignById(req.params.id) });
  })
);

calendarRouter.get(
  '/items',
  wrap((req: any, res: any) => {
    const accountId = req.query.accountId as string | undefined;
    const campaignId = req.query.campaignId as string | undefined;
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const items = calendarService.getCalendarItems({
      accountId,
      campaignId,
      days,
      startDate,
      endDate,
    });
    res.json({ items });
  })
);

calendarRouter.post(
  '/plan',
  wrap((req: any, res: any) => {
    const result = calendarService.createCampaignPlan(req.body);
    res.json(result);
  })
);

calendarRouter.post(
  '/campaigns/:id/submit-for-approval',
  wrap((req: any, res: any) => {
    const campaign = calendarService.submitCampaignForApproval(req.params.id);
    res.json({ campaign });
  })
);

calendarRouter.post(
  '/campaigns/:id/approve',
  wrap((req: any, res: any) => {
    const result = calendarService.approveCampaign(req.params.id, {accountId:req.body?.accountId,expectedHash:req.body?.expectedHash});
    res.json(result);
  })
);

calendarRouter.get('/campaigns/:id/review',wrap((req:any,res:any)=>res.json(calendarService.getCampaignReview(req.params.id))));

calendarRouter.post(
  '/campaigns/:id/pause',
  wrap((req: any, res: any) => {
    const campaign = calendarService.pauseCampaign(req.params.id);
    res.json({ campaign });
  })
);

calendarRouter.post(
  '/campaigns/:id/resume',
  wrap((req: any, res: any) => {
    const campaign = calendarService.resumeCampaign(req.params.id);
    res.json({ campaign });
  })
);

calendarRouter.post(
  '/items/:id/publish-now',
  wrap(async (req: any, res: any) => {
    const result = await calendarService.publishItemNow(req.params.id);
    res.json(result);
  })
);

calendarRouter.patch(
  '/items/:id',
  wrap((req: any, res: any) => {
    const item = calendarService.editItem(req.params.id, req.body);
    res.json({ item });
  })
);

calendarRouter.delete(
  '/items/:id',
  wrap((req: any, res: any) => {
    const result = calendarService.cancelItem(req.params.id);
    res.json(result);
  })
);
