"use client";

import Link from "next/link";
import { Client } from "@/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Edit, Trash2, Eye, Bot, Hash, MapPin } from "lucide-react";

interface ClientCardProps {
  client: Client;
  onDelete: (id: string) => void;
}

export function ClientCard({ client, onDelete }: ClientCardProps) {
  const hashtagCount =
    (client.tracking.instagram.hashtags?.length || 0) +
    (client.tracking.facebook.hashtags?.length || 0) +
    (client.tracking.tiktok.hashtags?.length || 0);

  const locationCount =
    (client.tracking.instagram.locations?.length || 0) +
    (client.tracking.facebook.locations?.length || 0);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-semibold">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <CardTitle className="text-lg">{client.name}</CardTitle>
            {client.tracking.instagram.handle && (
              <p className="text-sm text-muted-foreground">
                @{client.tracking.instagram.handle}
              </p>
            )}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(client.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent>
        {client.description && (
          <p className="mb-4 text-sm text-muted-foreground line-clamp-2">
            {client.description}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Hash className="h-4 w-4" />
            <span>{hashtagCount} hashtags</span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{locationCount} locations</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {client.agentId ? (
              <Badge variant="success">
                <Bot className="mr-1 h-3 w-3" />
                Agent Active
              </Badge>
            ) : (
              <Badge variant="secondary">No Agent</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/clients/${client.id}`}>View Details</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
