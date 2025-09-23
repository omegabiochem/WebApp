import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },   // allow frontend
})
export class ReportsGateway {
  @WebSocketServer()
  server: Server;

  notifyStatusChange(id: string, status: string) {
    console.log("📢 Emitting status change:", id, status);
    this.server.emit('reportStatusChanged', { id, status });
  }

  notifyReportCreated(report: any) {
    console.log("📢 Emitting new report:", report.id);
    this.server.emit('reportCreated', report);
  }

  notifyReportUpdate(report: any) {
    console.log("📢 Emitting report update:", report.id);
    this.server.emit('reportUpdated', report);
  }
}
