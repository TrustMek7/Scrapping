import { PrismaService } from "../prisma/prisma.service";
export declare class AlertsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(): Promise<({
        publication: {
            source: {
                name: string;
            };
            id: string;
            title: string;
            url: string;
            publishedAt: Date | null;
        };
        entity: {
            id: string;
            name: string;
        };
        notifications: {
            id: string;
            status: import("@prisma/client").$Enums.NotificationStatus;
            channel: import("@prisma/client").$Enums.NotificationChannel;
            sentAt: Date | null;
        }[];
    } & {
        category: import("@prisma/client").$Enums.ContentCategory;
        severity: import("@prisma/client").$Enums.Severity;
        confidence: number;
        summary: string;
        id: string;
        createdAt: Date;
        publicationId: string;
        analysisId: string;
        entityId: string;
    })[]>;
}
