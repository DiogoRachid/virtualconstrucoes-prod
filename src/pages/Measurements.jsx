import React from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Ruler } from 'lucide-react';

export default function Measurements() {
  return (
    <div>
      <PageHeader
        title="Medições"
        subtitle="Gerencie as medições de obra"
        icon={Ruler}
      />
      
      <div className="text-center py-12">
        <p className="text-slate-500">Funcionalidade em desenvolvimento</p>
      </div>
    </div>
  );
}