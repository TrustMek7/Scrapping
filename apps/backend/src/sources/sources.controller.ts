import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { CreateSourceSchema, UpdateSourceSchema } from "@scrapping/shared";
import { PrismaService } from "../prisma/prisma.service";

@Controller("sources")
export class SourcesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.source.findMany({ orderBy: { createdAt: "desc" } });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("Fuente no encontrada");
    return source;
  }

  @Post()
  create(@Body() body: unknown) {
    const parsed = CreateSourceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prisma.source.create({ data: parsed.data });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = UpdateSourceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.ensureExists(id);
    return this.prisma.source.update({ where: { id }, data: parsed.data });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.ensureExists(id);
    await this.prisma.source.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const source = await this.prisma.source.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("Fuente no encontrada");
  }
}
