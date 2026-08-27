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
import { CreateMonitoredEntitySchema, UpdateMonitoredEntitySchema } from "@scrapping/shared";
import { PrismaService } from "../prisma/prisma.service";

@Controller("entities")
export class EntitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.monitoredEntity.findMany({ orderBy: { createdAt: "desc" } });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const entity = await this.prisma.monitoredEntity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException("Entidad no encontrada");
    return entity;
  }

  @Post()
  create(@Body() body: unknown) {
    const parsed = CreateMonitoredEntitySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.prisma.monitoredEntity.create({ data: parsed.data });
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: unknown) {
    const parsed = UpdateMonitoredEntitySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.ensureExists(id);
    return this.prisma.monitoredEntity.update({ where: { id }, data: parsed.data });
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.ensureExists(id);
    await this.prisma.monitoredEntity.delete({ where: { id } });
    return { deleted: true };
  }

  private async ensureExists(id: string) {
    const entity = await this.prisma.monitoredEntity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException("Entidad no encontrada");
  }
}
