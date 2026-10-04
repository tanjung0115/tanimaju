import { apiFetch, errorMessage } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { DashboardLayout } from "@/components/Layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/SearchBarProps";
import { ActionButtons } from "@/components/ActionButton";
import { TableFooter } from "@/components/TableFooter";
import { Alert } from "@/components/Alert";
import { Konfirmasi } from "@/components/Konfirmasi";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Clock } from "lucide-react";
import type { UserRole } from "@/context/AuthContext";

interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  petaniProfileId: number | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface UserApiRecord {
  id: number | string;
  username?: string;
  email?: string;
  role?: UserRole;
  petani_profile_id?: number | null;
  status?: "pending" | "approved" | "rejected";
  created_at?: string;
  createdAt?: string;
}

export default function UserApprovalPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [petaniOptions, setPetaniOptions] = useState<Array<{ id: number; nama: string }>>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [perPage, setPerPage] = useState(10);
  const API_URL = import.meta.env.VITE_API_URL;
  const [alert, setAlert] = useState<{
    variant: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "approve" | "reject";
    userId: string;
    userName: string;
    role: Exclude<UserRole, "admin" | "user">;
  } | null>(null);

  const mapApiData = (item: UserApiRecord): User => ({
    id: item.id.toString(),
    username: item.username || "",
    email: item.email || "",
    role: item.role || "petani",
    petaniProfileId: item.petani_profile_id ?? null,
    status: item.status || "pending",
    createdAt: item.created_at || item.createdAt || "",
  });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/auth/pending-users`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }

      const raw = await res.json();
      const mapped = (raw as UserApiRecord[]).map(mapApiData);
      setUsers(mapped);
    } catch (err) {
      console.error("Failed to load users:", err);
      setAlert({
        variant: "error",
        title: "Error",
        message: errorMessage(err, "Failed to load users data"),
      });
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    apiFetch(`${API_URL}/petani`)
      .then((response) => response.json())
      .then((data: Array<{ id?: number; _id?: string; nama: string }>) => {
        setPetaniOptions(data.map((item) => ({ id: item.id ?? Number(item._id), nama: item.nama })));
      })
      .catch((err) => console.error("Failed to load petani profiles:", err));
  }, [API_URL]);

  const filteredUsers = users.filter((user) =>
    Object.values(user).some((v) =>
      String(v).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const handleAction = (
    type: "approve" | "reject",
    userId: string,
    userName: string,
    role: Exclude<UserRole, "admin" | "user">
  ) => {
    setConfirmAction({ type, userId, userName, role });
  };

  const confirmUserAction = async () => {
    if (!confirmAction) return;

    try {
      const res = await apiFetch(`${API_URL}/auth/update-user-status`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: confirmAction.userId,
          status: confirmAction.type === "approve" ? "approved" : "rejected",
          ...(confirmAction.type === "approve" && { role: confirmAction.role }),
        }),
      });

      if (!res.ok) throw new Error("Failed to update user status");

      setAlert({
        variant: "success",
        title: "Success",
        message: `User ${confirmAction.userName} has been ${confirmAction.type}d successfully!`,
      });

      fetchUsers(); // Refresh the list
    } catch {
      setAlert({
        variant: "error",
        title: "Error",
        message: `Failed to ${confirmAction.type} user`,
      });
    } finally {
      setConfirmAction(null);
    }
  };

  const linkPetaniProfile = async (userId: string, petaniId: string) => {
    if (!petaniId) return;
    try {
    const response = await apiFetch(`${API_URL}/petani/${petaniId}/link-user`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      setAlert({ variant: "error", title: "Error", message: "Profil Petani gagal dihubungkan" });
      return;
    }
    setAlert({ variant: "success", title: "Berhasil", message: "Akun berhasil dihubungkan ke profil Petani" });
    fetchUsers();
    } catch (cause) { setAlert({ variant: "error", title: "Gagal", message: errorMessage(cause) }); }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <DashboardLayout>
      <div className="px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">User Approval</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <SearchBar value={searchTerm} onChange={setSearchTerm} />

          <ActionButtons
            onRefresh={fetchUsers}
            loading={loading}
            actions={[]}
          />
        </div>

        {alert && (
          <div className="mb-4">
            <Alert
              variant={alert.variant}
              title={alert.title}
              duration={5000}
              onClose={() => setAlert(null)}
            >
              {alert.message}
            </Alert>
          </div>
        )}

        {confirmAction && (
          <Konfirmasi
            title={`Konfirmasi ${
              confirmAction.type === "approve" ? "Persetujuan" : "Penolakan"
            }`}
            message={`Apakah Anda yakin ingin ${confirmAction.type} pengguna "${confirmAction.userName}"?`}
            onConfirm={confirmUserAction}
            onCancel={() => setConfirmAction(null)}
          />
        )}

        {/* Table */}
        <div className="bg-white border rounded-lg shadow-sm mb-6 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">No</TableHead>
                <TableHead>Nama Lengkap</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Profil Petani</TableHead>
                <TableHead>Tanggal Daftar</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Loading users...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user, index) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      {user.status === "pending" ? (
                        <select
                          value={user.role === "penyuluh" ? "penyuluh" : "petani"}
                          onChange={(event) => {
                            const role = event.target.value as "petani" | "penyuluh";
                            setUsers((currentUsers) =>
                              currentUsers.map((currentUser) =>
                                currentUser.id === user.id
                                  ? { ...currentUser, role }
                                  : currentUser
                              )
                            );
                          }}
                          className="rounded border border-gray-300 px-2 py-1 text-sm"
                        >
                          <option value="petani">Petani</option>
                          <option value="penyuluh">Penyuluh</option>
                        </select>
                      ) : (
                        user.role
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      {user.role === "petani" && user.petaniProfileId ? (
                        <span className="text-sm text-green-700">Terhubung</span>
                      ) : user.role === "petani" && user.status === "approved" ? (
                        <div className="flex flex-col gap-1">
                          <select className="rounded border px-2 py-1 text-sm" defaultValue="" onChange={(event) => linkPetaniProfile(user.id, event.target.value)}>
                            <option value="">Pilih profil</option>
                            {petaniOptions.filter((petani) => !users.some((item) => item.petaniProfileId === petani.id)).map((petani) => <option key={petani.id} value={petani.id}>{petani.nama}</option>)}
                          </select>
                          <span className="text-xs text-amber-700">Belum terhubung</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(user.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                        {user.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() =>
                                handleAction("approve", user.id, user.username, user.role === "penyuluh" ? "penyuluh" : "petani")
                              }
                              className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Approve</span>
                              <span className="sm:hidden">✓</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() =>
                                handleAction("reject", user.id, user.username, user.role === "penyuluh" ? "penyuluh" : "petani")
                              }
                              className="w-full sm:w-auto"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Reject</span>
                              <span className="sm:hidden">✗</span>
                            </Button>
                          </>
                        )}
                        {user.status !== "pending" && (
                          <span className="text-xs sm:text-sm text-gray-500 text-center">
                            {user.status === "approved"
                              ? "Already approved"
                              : "Already rejected"}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <TableFooter
          total={users.length}
          filtered={filteredUsers.length}
          perPage={perPage}
          onPerPageChange={setPerPage}
        />
      </div>
    </DashboardLayout>
  );
}
