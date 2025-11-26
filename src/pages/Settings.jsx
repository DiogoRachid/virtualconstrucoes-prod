import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, User, Shield, Loader2, Check } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

const PERMISSION_LABELS = {
  admin: 'Administrador',
  analyst: 'Analista Financeiro',
  director: 'Diretoria'
};

const PERMISSION_DESCRIPTIONS = {
  admin: 'Acesso total: visualização, cadastro, edição e exclusão',
  analyst: 'Visualização, cadastro e edição (sem exclusão)',
  director: 'Apenas visualização e geração de relatórios'
};

export default function Settings() {
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const user = await base44.auth.me();
      setCurrentUser(user);
    };
    loadUser();
  }, []);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, data }) => base44.entities.User.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Permissão atualizada com sucesso');
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data) => base44.auth.updateMe(data),
    onSuccess: () => {
      toast.success('Perfil atualizado com sucesso');
    }
  });

  const [profileData, setProfileData] = useState({
    cargo: '',
    departamento: '',
    telefone: ''
  });

  useEffect(() => {
    if (currentUser) {
      setProfileData({
        cargo: currentUser.cargo || '',
        departamento: currentUser.departamento || '',
        telefone: currentUser.telefone || ''
      });
    }
  }, [currentUser]);

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(profileData);
  };

  const isAdmin = currentUser?.permissao_financeiro === 'admin' || currentUser?.role === 'admin';

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie suas preferências e permissões"
        icon={SettingsIcon}
      />

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          {isAdmin && <TabsTrigger value="permissions">Permissões</TabsTrigger>}
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Perfil
              </CardTitle>
              <CardDescription>
                Atualize suas informações pessoais
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={currentUser?.full_name || ''}
                    disabled
                    className="mt-1.5 bg-slate-50"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    value={currentUser?.email || ''}
                    disabled
                    className="mt-1.5 bg-slate-50"
                  />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input
                    value={profileData.cargo}
                    onChange={(e) => setProfileData(prev => ({ ...prev, cargo: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Departamento</Label>
                  <Input
                    value={profileData.departamento}
                    onChange={(e) => setProfileData(prev => ({ ...prev, departamento: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={profileData.telefone}
                    onChange={(e) => setProfileData(prev => ({ ...prev, telefone: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Nível de Permissão</Label>
                  <Input
                    value={PERMISSION_LABELS[currentUser?.permissao_financeiro] || 'Usuário'}
                    disabled
                    className="mt-1.5 bg-slate-50"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateProfileMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Permissões de Acesso
                </CardTitle>
                <CardDescription>
                  Gerencie os níveis de acesso dos usuários ao módulo financeiro
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6 p-4 bg-slate-50 rounded-xl">
                  <h4 className="font-medium mb-2">Níveis de Permissão:</h4>
                  <ul className="space-y-1 text-sm text-slate-600">
                    <li><strong>Administrador:</strong> {PERMISSION_DESCRIPTIONS.admin}</li>
                    <li><strong>Analista Financeiro:</strong> {PERMISSION_DESCRIPTIONS.analyst}</li>
                    <li><strong>Diretoria:</strong> {PERMISSION_DESCRIPTIONS.director}</li>
                  </ul>
                </div>

                {loadingUsers ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Permissão Atual</TableHead>
                        <TableHead>Alterar Para</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(user => (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.full_name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                              {PERMISSION_LABELS[user.permissao_financeiro] || 'Não definido'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.permissao_financeiro || 'analyst'}
                              onValueChange={(value) => updateUserMutation.mutate({ 
                                userId: user.id, 
                                data: { permissao_financeiro: value }
                              })}
                              disabled={user.id === currentUser?.id}
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Administrador</SelectItem>
                                <SelectItem value="analyst">Analista Financeiro</SelectItem>
                                <SelectItem value="director">Diretoria</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}