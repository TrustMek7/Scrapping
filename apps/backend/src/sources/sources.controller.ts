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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Workbook, type Cell } from "exceljs";
import { Readable } from "node:stream";
import { CreateSourceSchema, UpdateSourceSchema } from "@scrapping/shared";
import { PrismaService } from "../prisma/prisma.service";

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((run) => run.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }
    if ("result" in value) {
      return String(value.result ?? "").trim();
    }
  }
  return String(value).trim();
}

function cellUrl(cell: Cell): string {
  const value = cell.value;
  if (value && typeof value === "object" && "hyperlink" in value && typeof value.hyperlink === "string") {
    return value.hyperlink.trim();
  }
  return cellText(cell);
}

@Controller("sources")
export class SourcesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.source.findMany({ orderBy: { createdAt: "desc" } });
  }

  @Post("import/excel")
  @UseInterceptors(FileInterceptor("file"))
  async importExcel(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("Se requiere un archivo Excel para importar fuentes.");
    }

    const extension = file.originalname.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
      throw new BadRequestException("Formato no soportado. Usa un archivo .xlsx, .xls o .csv");
    }

    const workbook = new Workbook();
    try {
      if (extension === "csv") {
        await workbook.csv.read(Readable.from(file.buffer));
      } else {
        await workbook.xlsx.load(file.buffer);
      }
    } catch {
      throw new BadRequestException(
        "No se pudo leer el archivo. Verificá que sea un .xlsx, .xls o .csv válido (si es .xls antiguo, guardalo como .xlsx).",
      );
    }
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new BadRequestException("El archivo Excel está vacío o no tiene hojas.");
    }

    const entries: { name: string; url: string }[] = [];
    const errors: string[] = [];
    const duplicates: string[] = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const name = cellText(row.getCell(1));
      const rawUrl = cellUrl(row.getCell(2));

      if (!name && !rawUrl) continue;

      if (!name || !rawUrl) {
        errors.push(`Fila ${rowNumber}: la primera columna debe ser el nombre y la segunda el link.`);
        continue;
      }

      try {
        const url = new URL(rawUrl);
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error();
        }

        const existing = await this.prisma.source.findFirst({
          where: {
            type: "FACEBOOK",
            url: rawUrl,
          },
        });

        if (existing) {
          duplicates.push(`Fila ${rowNumber}: "${name}" ya existe.`);
          continue;
        }

        entries.push({ name, url: rawUrl });
      } catch {
        errors.push(`Fila ${rowNumber}: el link no es válido: ${rawUrl}`);
      }
    }

    const created: { name: string; url: string }[] = [];
    for (const entry of entries) {
      const source = await this.prisma.source.create({
        data: {
          name: entry.name,
          type: "FACEBOOK",
          url: entry.url,
          status: "ACTIVE",
        },
      });
      created.push({ name: source.name, url: source.url });
    }

    return {
      created: created.length,
      skipped: duplicates.length,
      errors,
      message: `Se importaron ${created.length} fuentes de tipo Facebook.`,
    };
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
