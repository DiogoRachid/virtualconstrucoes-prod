import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseInvoiceXml } from '@/components/invoice/InvoiceXmlParser';

export default function ImportInvoicePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [xmlFile, setXmlFile] = useState(null);
  const [selectedWork, setSelectedWork] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);

  const { data: works = [] } = useQuery({
    queryKey: ['works'],
    queryFn: () => base44.entities.Project.list()
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list()
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!xmlFile || !selectedWork) {
        throw new Error('Selecione a obra e o arquivo XML');
      }

      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async (e) => {
          try {
            const xmlContent = e.target.result;
            
            // Parse XML no frontend
            const parsedData = parseInvoiceXml(xmlContent);
            
            // Criar a nota fiscal com os dados extraídos
            const emissionDate = new Date(parsedData.emissionDate).toISOString().split('T')[0];
            
            let fornecedorId = selectedSupplier;
            
            // Se não houver fornecedor selecionado, buscar pelo CNPJ
            if (!fornecedorId && parsedData.supplier.cnpj) {
              const suppliers = await base44.entities.Supplier.filter({ cnpj: parsedData.supplier.cnpj });
              if (suppliers.length > 0) {
                fornecedorId = suppliers[0].id;
              } else {
                // Criar novo fornecedor se não encontrar
                const novoFornecedor = await base44.entities.Supplier.create({
                  razao_social: parsedData.supplier.name,
                  cnpj: parsedData.supplier.cnpj,
                  status: 'ativo',
                  tipo_servico: 'Fornecimento de Materiais',
                  endereco: `${parsedData.supplier.address.street}, ${parsedData.supplier.address.number}`,
                  cidade: parsedData.supplier.address.city,
                  estado: parsedData.supplier.address.state,
                  cep: parsedData.supplier.address.zipCode,
                });
                fornecedorId = novoFornecedor.id;
              }
            }

            const invoiceData = {
              numero_nota: parsedData.invoiceNumber,
              serie: parsedData.invoiceSeries,
              data_emissao: emissionDate,
              fornecedor_id: fornecedorId,
              fornecedor_nome: parsedData.supplier.name || parsedData.supplier.fantasyName,
              fornecedor_cnpj: parsedData.supplier.cnpj,
              obra_id: selectedWork,
              obra_nome: works.find(w => w.id === selectedWork)?.nome || '',
              valor_total: parsedData.totals.amount,
              valor_produtos: parsedData.totals.amount - parsedData.totals.icms - parsedData.totals.ipi,
              valor_icms: parsedData.totals.icms,
              valor_ipi: parsedData.totals.ipi,
              observacoes: `Importado do XML em ${new Date().toLocaleDateString('pt-BR')}`,
              status: 'importada',
            };

            // Criar registro de nota fiscal
            const invoice = await base44.entities.Invoice.create(invoiceData);

            // Criar itens da nota fiscal
            for (const item of parsedData.items) {
              await base44.entities.InvoiceItem.create({
                nota_fiscal_id: invoice.id,
                codigo_xml: item.productCode,
                descricao_xml: item.productName,
                ncm: item.ncm,
                unidade_xml: item.unit,
                quantidade_xml: item.quantity,
                valor_unitario_xml: item.unitPrice,
                valor_total: item.totalValue,
                status_mapeamento: 'nao_mapeado',
              });
            }

            resolve({
              invoice: invoice.id,
              items: parsedData.items,
              data: parsedData
            });
          } catch (error) {
            reject(error);
          }
        };
        reader.readAsText(xmlFile);
      });
    },
    onSuccess: (data) => {
      setUploadStatus({ 
        type: 'success', 
        message: `Nota fiscal importada! ${data.items.length} itens processados`,
        invoiceId: data.invoice
      });
      setTimeout(() => {
        navigate(createPageUrl(`ImportInvoiceMapping?id=${data.invoice}`));
      }, 2000);
    },
    onError: (error) => {
      setUploadStatus({ 
        type: 'error', 
        message: error.message || 'Erro ao importar nota fiscal'
      });
    }
  });

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        title="Importar Nota Fiscal"
        subtitle="Carregue o arquivo XML da NFe para importação automática"
        icon={Upload}
      />

      <Card>
        <CardHeader>
          <CardTitle>Dados da Importação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Seleção de Obra */}
          <div className="space-y-2">
            <Label htmlFor="work">Obra</Label>
            <Select value={selectedWork} onValueChange={setSelectedWork}>
              <SelectTrigger id="work">
                <SelectValue placeholder="Selecione a obra" />
              </SelectTrigger>
              <SelectContent>
                {works.map(work => (
                  <SelectItem key={work.id} value={work.id}>
                    {work.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seleção de Fornecedor (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="supplier">Fornecedor (opcional - será extraído do XML)</Label>
            <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
              <SelectTrigger id="supplier">
                <SelectValue placeholder="Fornecedor será buscado pelo CNPJ da nota" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map(supplier => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.razao_social}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload de Arquivo */}
          <div className="space-y-2">
            <Label htmlFor="xml">Arquivo XML da NFe</Label>
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 transition-colors">
              <input
                id="xml"
                type="file"
                accept=".xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label htmlFor="xml" className="cursor-pointer">
                <FileText className="h-12 w-12 mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium text-slate-900">
                  {xmlFile ? xmlFile.name : 'Clique para selecionar ou arraste o arquivo'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Apenas arquivos XML</p>
              </label>
            </div>
          </div>

          {/* Status da Importação */}
          {uploadStatus && (
            <div className={`p-4 rounded-lg flex items-start gap-3 ${
              uploadStatus.type === 'success' 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {uploadStatus.type === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`font-medium ${
                  uploadStatus.type === 'success' ? 'text-green-900' : 'text-red-900'
                }`}>
                  {uploadStatus.message}
                </p>
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!xmlFile || !selectedWork || importMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {importMutation.isPending ? 'Processando...' : 'Importar Nota Fiscal'}
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('Projects'))}>
              Cancelar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}