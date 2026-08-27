import { PrismaService } from "../prisma/prisma.service";
export declare class EntitiesController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        name: string;
        aliases: string[];
        updatedAt: Date;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        aliases: string[];
        updatedAt: Date;
    }>;
    create(body: unknown): import("@prisma/client").Prisma.Prisma__MonitoredEntityClient<{
        id: string;
        createdAt: Date;
        name: string;
        aliases: string[];
        updatedAt: Date;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    update(id: string, body: unknown): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        aliases: string[];
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
    private ensureExists;
}
