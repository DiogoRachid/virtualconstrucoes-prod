import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  Users, Pencil, Phone, Mail, MapPin, Calendar, Briefcase, 
  Building2, FileText, Download, UserCircle 
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import moment from 'moment';

const vinculoLabels = {
  clt: 'CLT',
  pj: 'PJ',
  terceirizado: 'Terceirizado'
};

export default function EmployeeDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const employeeId = urlParams.get('id');

  const { data: employee, isLoading } = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: async () => {
      const result = await base44.entities.Employee.filter({ id: employeeId });
      return result[0];
    },
    enabled: !!employeeId
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts', employeeId],
    queryFn: () => base44.entities.EmployeeContract.filter({ colaborador_id: employeeId }),
    enabled: !!employeeId
  });

  const { data: benefits = [] } = useQuery({
    queryKey: ['employeeBenefits', employeeId],
    queryFn: () => base44.entities.EmployeeBenefit.filter({ colaborador_id: employeeId }),
    enabled: !!employeeId
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Carregando...</div>;
  }

  if (!employee) {
    return <div className="text-center py-8">Colaborador não encontrado</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={employee.nome_completo}
        subtitle={employee.funcao}
        icon={Users}
        backUrl={createPageUrl('Employees')}
      />

      <div className="flex justify-end">
        <Link to={createPageUrl(`EmployeeForm?id=${employee.id}`)}>
          <Button>
            <Pencil className="h-4 w-4 mr-2" /> Editar
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              {employee.foto_url ? (
                <img src={employee.foto_url} alt="" className="h-24 w-24 rounded-full object-cover mb-4" />
              ) : (
                <div className="h-24 w-24 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                  <UserCircle className="h-12 w-12 text-blue-600" />
                </div>
              )}
              <h3 className="text-lg font-semibold">{employee.nome_completo}</h3>
              <p className="text-slate-500">{employee.funcao}</p>
              <div className="flex gap-2 mt-3">
                <StatusBadge status={employee.status} />
                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  {vinculoLabels[employee.tipo_vinculo]}
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-slate-400" />
                <span>{employee.cpf}</span>
              </div>
              {employee.telefone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-slate-400" />
                  <span>{employee.telefone}</span>
                </div>
              )}
              {employee.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span>{employee.email}</span>
                </div>
              )}
              {employee.endereco && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <span>{employee.endereco}, {employee.cidade} - {employee.estado}</span>
                </div>
              )}
              {employee.data_nascimento && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>Nascimento: {moment(employee.data_nascimento).format('DD/MM/YYYY')}</span>
                </div>
              )}
              {employee.data_admissao && (
                <div className="flex items-center gap-3 text-sm">
                  <Briefcase className="h-4 w-4 text-slate-400" />
                  <span>Admissão: {moment(employee.data_admissao).format('DD/MM/YYYY')}</span>
                </div>
              )}
              {employee.obra_nome && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span>{employee.obra_nome}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <Tabs defaultValue="contracts">
            <CardHeader>
              <TabsList>
                <TabsTrigger value="contracts">Contratos</TabsTrigger>
                <TabsTrigger value="benefits">Benefícios</TabsTrigger>
                <TabsTrigger value="documents">Documentos</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="contracts">
                {contracts.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Nenhum contrato cadastrado</p>
                ) : (
                  <div className="space-y-4">
                    {contracts.map(contract => (
                      <div key={contract.id} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{contract.tipo_contrato?.toUpperCase()}</p>
                            <p className="text-sm text-slate-500">
                              {moment(contract.data_inicio).format('DD/MM/YYYY')} 
                              {contract.data_fim && ` até ${moment(contract.data_fim).format('DD/MM/YYYY')}`}
                            </p>
                          </div>
                          <StatusBadge status={contract.status} />
                        </div>
                        {contract.salario && (
                          <p className="mt-2 text-lg font-semibold text-emerald-600">
                            R$ {contract.salario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="benefits">
                {benefits.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">Nenhum benefício vinculado</p>
                ) : (
                  <div className="space-y-4">
                    {benefits.map(benefit => (
                      <div key={benefit.id} className="p-4 border rounded-lg flex justify-between items-center">
                        <div>
                          <p className="font-medium">{benefit.beneficio_nome}</p>
                          {benefit.valor && (
                            <p className="text-sm text-slate-500">
                              R$ {benefit.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={benefit.status} />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documents">
                {(!employee.documentos || employee.documentos.length === 0) ? (
                  <p className="text-slate-500 text-center py-8">Nenhum documento anexado</p>
                ) : (
                  <div className="space-y-2">
                    {employee.documentos.map((doc, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                          <div>
                            <p className="font-medium">{doc.nome}</p>
                            <p className="text-xs text-slate-500">{doc.data_upload}</p>
                          </div>
                        </div>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>

      {employee.observacoes && (
        <Card>
          <CardHeader>
            <CardTitle>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600 whitespace-pre-wrap">{employee.observacoes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}