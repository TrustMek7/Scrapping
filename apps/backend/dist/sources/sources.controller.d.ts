import { PrismaService } from "../prisma/prisma.service";
export declare class SourcesController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        url: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.SourceStatus;
        type: import("@prisma/client").$Enums.SourceType;
        updatedAt: Date;
        lastRunAt: Date | null;
        lastPublicationAt: Date | null;
        lastError: string | null;
        publicationsCount: number;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        url: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.SourceStatus;
        type: import("@prisma/client").$Enums.SourceType;
        updatedAt: Date;
        lastRunAt: Date | null;
        lastPublicationAt: Date | null;
        lastError: string | null;
        publicationsCount: number;
    }>;
    create(body: unknown): import("@prisma/client").Prisma.Prisma__SourceClient<{
        id: string;
        url: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.SourceStatus;
        type: import("@prisma/client").$Enums.SourceType;
        updatedAt: Date;
        lastRunAt: Date | null;
        lastPublicationAt: Date | null;
        lastError: string | null;
        publicationsCount: number;
    }, never, import("@prisma/client/runtime/library").DefaultArgs>;
    update(id: string, body: unknown): Promise<{
        id: string;
        url: string;
        createdAt: Date;
        name: string;
        status: import("@prisma/client").$Enums.SourceStatus;
        type: import("@prisma/client").$Enums.SourceType;
        updatedAt: Date;
        lastRunAt: Date | null;
        lastPublicationAt: Date | null;
        lastError: string | null;
        publicationsCount: number;
    }>;
    remove(id: string): Promise<{
        deleted: boolean;
    }>;
    private ensureExists;
}
