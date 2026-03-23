import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, User, Shield, Building2, Loader2, Check, Upload, ImageIcon, HardHat, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import UserModulesConfig from '@/components/settings/UserModulesConfig';
import PortalUsersConfig from '@/components/settings/PortalUsersConfig';
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
  const [modulesDialogUser, setModulesDialogUser] = useState(null);
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

  const { data: companySettingsList = [] } = useQuery({
    queryKey: ['companySettings'],
    queryFn: () => base44.entities.CompanySettings.list()
  });

  const companySettings = companySettingsList[0] || {};

  const [companyData, setCompanyData] = useState({
    nome_empresa: '',
    logo_url_clara: '',
    logo_url_escura: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    site: '',
    ramo_atividade: ''
  });

  const [uploadingClara, setUploadingClara] = useState(false);
  const [uploadingEscura, setUploadingEscura] = useState(false);

  useEffect(() => {
    if (companySettings.id) {
      setCompanyData({
        nome_empresa: companySettings.nome_empresa || '',
        logo_url_clara: companySettings.logo_url_clara || '',
        logo_url_escura: companySettings.logo_url_escura || '',
        cnpj: companySettings.cnpj || '',
        telefone: companySettings.telefone || '',
        email: companySettings.email || '',
        endereco: companySettings.endereco || '',
        cidade: companySettings.cidade || '',
        estado: companySettings.estado || '',
        cep: companySettings.cep || '',
        site: companySettings.site || '',
        ramo_atividade: companySettings.ramo_atividade || ''
      });
    }
  }, [companySettings.id]);

  const saveCompanyMutation = useMutation({
    mutationFn: async (data) => {
      if (companySettings.id) {
        return base44.entities.CompanySettings.update(companySettings.id, data);
      } else {
        return base44.entities.CompanySettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companySettings'] });
      toast.success('Configurações da empresa salvas com sucesso');
    }
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

  const handleUploadLogo = async (e, tipo) => {
    const file = e.target.files[0];
    if (!file) return;

    if (tipo === 'clara') setUploadingClara(true);
    else setUploadingEscura(true);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    if (tipo === 'clara') {
      setCompanyData(prev => ({ ...prev, logo_url_clara: file_url }));
      setUploadingClara(false);
    } else {
      setCompanyData(prev => ({ ...prev, logo_url_escura: file_url }));
      setUploadingEscura(false);
    }

    toast.success('Logo enviada com sucesso');
  };

  const isAdmin = currentUser?.permissao_financeiro === 'admin' || currentUser?.role === 'admin';

  return (
    <div>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie empresa, perfil e permissões"
        icon={SettingsIcon}
      />

      <Tabs defaultValue="empresa" className="space-y-6">
        <TabsList>
          {isAdmin && <TabsTrigger value="empresa">Empresa</TabsTrigger>}
          <TabsTrigger value="profile">Meu Perfil</TabsTrigger>
          {isAdmin && <TabsTrigger value="permissions">Permissões</TabsTrigger>}
          {isAdmin && <TabsTrigger value="portais">Usuários dos Portais</TabsTrigger>}
        </TabsList>

        {/* ABA EMPRESA */}
        {isAdmin && (
          <TabsContent value="empresa">
            <div className="space-y-6">
              {/* Identidade Visual */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Identidade Visual
                  </CardTitle>
                  <CardDescription>Logo e nome exibidos em todo o sistema</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <Label>Nome da Empresa</Label>
                    <Input
                      value={companyData.nome_empresa}
                      onChange={(e) => setCompanyData(prev => ({ ...prev, nome_empresa: e.target.value }))}
                      placeholder="Ex: Virtual Construções"
                      className="mt-1.5 max-w-md"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Logo fundo claro */}
                    <div>
                      <Label>Logo para Fundo Claro</Label>
                      <div className="mt-1.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-3">
                        {companyData.logo_url_clara ? (
                          <img src={companyData.logo_url_clara} alt="Logo clara" className="h-16 object-contain" />
                        ) : (
                          <div className="h-16 flex items-center justify-center text-slate-400 text-sm">Sem logo</div>
                        )}
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadLogo(e, 'clara')} />
                          <Button variant="outline" size="sm" disabled={uploadingClara} asChild>
                            <span>
                              {uploadingClara ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                              {uploadingClara ? 'Enviando...' : 'Enviar Logo'}
                            </span>
                          </Button>
                        </label>
                        {companyData.logo_url_clara && (
                          <Input
                            value={companyData.logo_url_clara}
                            onChange={(e) => setCompanyData(prev => ({ ...prev, logo_url_clara: e.target.value }))}
                            placeholder="URL da logo"
                            className="text-xs"
                          />
                        )}
                      </div>
                    </div>

                    {/* Logo fundo escuro */}
                    <div>
                      <Label>Logo para Fundo Escuro</Label>
                      <div className="mt-1.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center gap-3 bg-slate-800">
                        {companyData.logo_url_escura ? (
                          <img src={companyData.logo_url_escura} alt="Logo escura" className="h-16 object-contain" />
                        ) : (
                          <div className="h-16 flex items-center justify-center text-slate-400 text-sm">Sem logo</div>
                        )}
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => handleUploadLogo(e, 'escura')} />
                          <Button variant="outline" size="sm" disabled={uploadingEscura} asChild>
                            <span>
                              {uploadingEscura ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                              {uploadingEscura ? 'Enviando...' : 'Enviar Logo'}
                            </span>
                          </Button>
                        </label>
                        {companyData.logo_url_escura && (
                          <Input
                            value={companyData.logo_url_escura}
                            onChange={(e) => setCompanyData(prev => ({ ...prev, logo_url_escura: e.target.value }))}
                            placeholder="URL da logo"
                            className="text-xs"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Dados da Empresa */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Dados da Empresa
                  </CardTitle>
                  <CardDescription>Informações utilizadas em relatórios e documentos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>CNPJ</Label>
                      <Input value={companyData.cnpj} onChange={(e) => setCompanyData(prev => ({ ...prev, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Ramo de Atividade</Label>
                      <Input value={companyData.ramo_atividade} onChange={(e) => setCompanyData(prev => ({ ...prev, ramo_atividade: e.target.value }))} placeholder="Ex: Construção Civil" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Telefone</Label>
                      <Input value={companyData.telefone} onChange={(e) => setCompanyData(prev => ({ ...prev, telefone: e.target.value }))} placeholder="(00) 00000-0000" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input value={companyData.email} onChange={(e) => setCompanyData(prev => ({ ...prev, email: e.target.value }))} placeholder="contato@empresa.com" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Site</Label>
                      <Input value={companyData.site} onChange={(e) => setCompanyData(prev => ({ ...prev, site: e.target.value }))} placeholder="www.empresa.com.br" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>CEP</Label>
                      <Input value={companyData.cep} onChange={(e) => setCompanyData(prev => ({ ...prev, cep: e.target.value }))} placeholder="00000-000" className="mt-1.5" />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Endereço</Label>
                      <Input value={companyData.endereco} onChange={(e) => setCompanyData(prev => ({ ...prev, endereco: e.target.value }))} placeholder="Rua, número, complemento" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Cidade</Label>
                      <Input value={companyData.cidade} onChange={(e) => setCompanyData(prev => ({ ...prev, cidade: e.target.value }))} placeholder="Cidade" className="mt-1.5" />
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Input value={companyData.estado} onChange={(e) => setCompanyData(prev => ({ ...prev, estado: e.target.value }))} placeholder="UF" className="mt-1.5" />
                    </div>
                  </div>

                  <Button
                    onClick={() => saveCompanyMutation.mutate(companyData)}
                    disabled={saveCompanyMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700 mt-2"
                  >
                    {saveCompanyMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Salvar Configurações
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        )}

        {/* ABA PERFIL */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Informações do Perfil
              </CardTitle>
              <CardDescription>Atualize suas informações pessoais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label>Nome</Label>
                  <Input value={currentUser?.full_name || ''} disabled className="mt-1.5 bg-slate-50" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={currentUser?.email || ''} disabled className="mt-1.5 bg-slate-50" />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input value={profileData.cargo} onChange={(e) => setProfileData(prev => ({ ...prev, cargo: e.target.value }))} className="mt-1.5" />
                </div>
                <div>
                  <Label>Departamento</Label>
                  <Input value={profileData.departamento} onChange={(e) => setProfileData(prev => ({ ...prev, departamento: e.target.value }))} className="mt-1.5" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={profileData.telefone} onChange={(e) => setProfileData(prev => ({ ...prev, telefone: e.target.value }))} className="mt-1.5" />
                </div>
                <div>
                  <Label>Nível de Permissão</Label>
                  <Input value={PERMISSION_LABELS[currentUser?.permissao_financeiro] || 'Usuário'} disabled className="mt-1.5 bg-slate-50" />
                </div>
              </div>
              <Button onClick={() => updateProfileMutation.mutate(profileData)} disabled={updateProfileMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {updateProfileMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA PERMISSÕES */}
        {isAdmin && (
          <TabsContent value="permissions">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Permissões de Acesso
                </CardTitle>
                <CardDescription>Gerencie os níveis de acesso dos usuários ao módulo financeiro</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <h4 className="font-medium mb-2">Níveis de Permissão:</h4>
                  <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
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
                      <TableHead>Portal / Módulos</TableHead>
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
                              onValueChange={(value) => updateUserMutation.mutate({ userId: user.id, data: { permissao_financeiro: value } })}
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
                          <TableCell>
                            <button
                              onClick={() => setModulesDialogUser(user)}
                              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <HardHat className="h-4 w-4" />
                              {user.tipo_portal === 'colaborador' ? `Colaborador (${(user.modulos_habilitados || []).length} módulos)` : 'Administrador'}
                            </button>
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
        {/* ABA PORTAIS */}
        {isAdmin && (
          <TabsContent value="portais">
            <PortalUsersConfig />
          </TabsContent>
        )}
      </Tabs>
    {/* Dialog configuração de módulos */}
    <Dialog open={!!modulesDialogUser} onOpenChange={() => setModulesDialogUser(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Acesso de {modulesDialogUser?.full_name}</DialogTitle>
        </DialogHeader>
        {modulesDialogUser && (
          <UserModulesConfig
            user={modulesDialogUser}
            onClose={() => setModulesDialogUser(null)}
          />
        )}
      </DialogContent>
    </Dialog>
    </div>
  );
}