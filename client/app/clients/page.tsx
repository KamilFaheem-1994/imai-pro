"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/layout";
import { ClientCard } from "@/components/clients";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getClients, deleteClient } from "@/db/queries";
import { Client } from "@/db/schema";
import { Plus, Search, Users } from "lucide-react";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadClients = () => {
    startTransition(async () => {
      const data = await getClients();
      setClients(data);
    });
  };

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = clients.filter(
        (client) =>
          client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          client.tracking?.instagram?.handle
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase())
      );
      setFilteredClients(filtered);
    } else {
      setFilteredClients(clients);
    }
  }, [clients, searchQuery]);

  const handleDeleteClick = (id: string) => {
    setClientToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (clientToDelete) {
      startTransition(async () => {
        await deleteClient(clientToDelete);
        loadClients();
        setDeleteDialogOpen(false);
        setClientToDelete(null);
      });
    }
  };

  return (
    <DashboardLayout title="Clients" description="Manage your brand clients">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 sm:w-[300px]"
            />
          </div>
          <Button asChild>
            <Link href="/clients/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Link>
          </Button>
        </div>

        {/* Client Grid */}
        {filteredClients.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No clients found</h3>
            <p className="mb-4 text-muted-foreground">
              {searchQuery
                ? "No clients match your search"
                : "Get started by adding your first client"}
            </p>
            {!searchQuery && (
              <Button asChild>
                <Link href="/clients/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Client
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Client</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this client? This will also
                delete any associated agents and tracked creators. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
