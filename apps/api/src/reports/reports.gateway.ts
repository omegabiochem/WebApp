import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';


@WebSocketGateway({
  cors: { origin: '*' }, // allow frontend React app
})
export class ReportsGateway {
  @WebSocketServer()
  server: Server;

  // event: report status changed
  notifyStatusChange(reportId: string, newStatus: string) {
    this.server.emit('reportStatusChanged', { reportId, newStatus });
  }

  // event: entire report updated (fields changed)
  notifyReportUpdate(report: any) {
    this.server.emit('reportUpdated', report);
  }

  // event: new report created
  notifyReportCreated(report: any) {
    this.server.emit('reportCreated', report);
  }
}
