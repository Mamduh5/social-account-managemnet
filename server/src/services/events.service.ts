import { Response } from 'express';

interface Client {
  id: string;
  res: Response;
}

class EventService {
  private clients: Client[] = [];

  addClient(id: string, res: Response) {
    this.clients.push({ id, res });
    res.write(`data: ${JSON.stringify({ type: 'connected', id })}\n\n`);
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
  }

  broadcast(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(payload);
      } catch {
        // Handled on client close
      }
    }
  }
}

export const eventService = new EventService();
