import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { FileText, Printer, Download, Calendar } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import PageHeader from '@/components/ui/PageHeader';
import moment from 'moment';

export default function TimeSheet() {
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(moment().format('YYYY-MM'));
  const printRef = useRef();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => base44.entities.Employee.filter({ status: 'ativo' })
  });

  const { data: records = [] } = useQuery({
    queryKey: ['timeRecords'],
    queryFn: () => base44.entities.TimeRecord.list()
  });

  const selectedEmp = employees.find(e => e.id === selectedEmployee);

  const monthRecords = records.filter(rec => 
    rec.colaborador_id === selectedEmployee &&
    rec.data?.startsWith(selectedMonth) &&
    rec.status === 'aprovado'
  ).sort((a, b) => a.data.localeCompare(b.data));

  const totalHoras = monthRecords.reduce((sum, rec) => sum + (rec.horas_trabalhadas || 0), 0);
  const diasTrabalhados = monthRecords.length;

  const getDaysInMonth = () => {
    const date = moment(selectedMonth, 'YYYY-MM');
    const daysInMonth = date.daysInMonth();
    const days = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const day = date.clone().date(i);
      const record = monthRecords.find(r => r.data === day.format('YYYY-MM-DD'));
      days.push({
        date: day.format('YYYY-MM-DD'),
        dayOfWeek: day.format('ddd'),
        dayNumber: i,
        isWeekend: day.day() === 0 || day.day() === 6,
        record
      });
    }
    return days;
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    const WinPrint = window.open('', '', 'width=900,height=650');
    WinPrint.document.write(`
      <html>
        <head>
          <title>Folha de Ponto - ${selectedEmp?.nome_completo}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .header img { height: 60px; margin-bottom: 10px; }
            .header h1 { font-size: 18px; margin: 10px 0; }
            .info { margin-bottom: 20px; }
            .info p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background: #f5f5f5; }
            .weekend { background: #fafafa; color: #999; }
            .summary { margin-top: 20px; }
            .signatures { margin-top: 50px; display: flex; justify-content: space-between; }
            .signature-line { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    WinPrint.document.close();
    WinPrint.focus();
    WinPrint.print();
    WinPrint.close();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Folha de Ponto"
        subtitle="Geração de folha de ponto mensal"
        icon={FileText}
        backUrl={createPageUrl('TimeRecords')}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o colaborador..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>{emp.nome_completo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          {selectedEmployee && (
            <Button onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
          )}
        </CardContent>
      </Card>

      {selectedEmployee && selectedEmp && (
        <Card>
          <CardContent className="pt-6">
            <div ref={printRef}>
              <div className="header text-center mb-6">
                <img 
                  src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_690c7efb29582ad524a0ff3e/fb3eac426_logofundoclaro.jpg" 
                  alt="Virtual Construções" 
                  className="h-16 mx-auto mb-4"
                />
                <h1 className="text-xl font-bold">FOLHA DE PONTO</h1>
                <p className="text-slate-500">
                  Período: {moment(selectedMonth, 'YYYY-MM').format('MMMM [de] YYYY')}
                </p>
              </div>

              <div className="info mb-6 p-4 bg-slate-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <p><strong>Colaborador:</strong> {selectedEmp.nome_completo}</p>
                  <p><strong>CPF:</strong> {selectedEmp.cpf}</p>
                  <p><strong>Função:</strong> {selectedEmp.funcao}</p>
                  <p><strong>Vínculo:</strong> {selectedEmp.tipo_vinculo?.toUpperCase()}</p>
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="p-2 border">Dia</th>
                    <th className="p-2 border">Entrada</th>
                    <th className="p-2 border">Saída Almoço</th>
                    <th className="p-2 border">Retorno</th>
                    <th className="p-2 border">Saída</th>
                    <th className="p-2 border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {getDaysInMonth().map(day => (
                    <tr key={day.date} className={day.isWeekend ? 'bg-slate-50 text-slate-400' : ''}>
                      <td className="p-2 border">
                        {day.dayNumber} ({day.dayOfWeek})
                      </td>
                      <td className="p-2 border">{day.record?.entrada || '-'}</td>
                      <td className="p-2 border">{day.record?.saida_almoco || '-'}</td>
                      <td className="p-2 border">{day.record?.retorno_almoco || '-'}</td>
                      <td className="p-2 border">{day.record?.saida || '-'}</td>
                      <td className="p-2 border font-medium">
                        {day.record?.horas_trabalhadas ? `${day.record.horas_trabalhadas}h` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="summary mt-6 p-4 bg-blue-50 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <p><strong>Total de Dias Trabalhados:</strong> {diasTrabalhados}</p>
                  <p><strong>Total de Horas:</strong> {totalHoras.toFixed(2)}h</p>
                </div>
              </div>

              <div className="signatures mt-12 flex justify-between">
                <div className="text-center">
                  <div className="border-t border-black w-48 pt-2">
                    <p>Colaborador</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-black w-48 pt-2">
                    <p>Gestor Responsável</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}