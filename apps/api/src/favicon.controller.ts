// src/favicon.controller.ts
import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

@Controller()
export class FaviconController {
  @Get("favicon.ico")
  favicon(@Res() res: Response) {
    return res.status(204).end();
  }
}
