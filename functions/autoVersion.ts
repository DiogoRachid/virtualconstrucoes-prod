import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entity_name, action, description } = await req.json();

    // Buscar a última versão
    const versions = await base44.asServiceRole.entities.VersionHistory.list('-numero_versao', 1);
    const lastVersion = versions[0];

    let newVersion = '1.0.0';
    
    if (lastVersion) {
      const [major, minor, patch] = lastVersion.numero_versao.split('.').map(Number);
      
      // Incrementar patch por padrão
      let newPatch = patch + 1;
      let newMinor = minor;
      let newMajor = major;
      
      // Se patch chegar a 10, resetar e incrementar minor
      if (newPatch >= 10) {
        newPatch = 0;
        newMinor += 1;
      }
      
      // Se minor chegar a 10, resetar e incrementar major
      if (newMinor >= 10) {
        newMinor = 0;
        newMajor += 1;
      }
      
      newVersion = `${newMajor}.${newMinor}.${newPatch}`;
    }

    // Mapear nomes de entidades para nomes amigáveis
    const entityLabels = {
      'AccountPayable': 'Contas a Pagar',
      'AccountReceivable': 'Contas a Receber',
      'BankAccount': 'Contas Bancárias',
      'Client': 'Clientes',
      'Supplier': 'Fornecedores',
      'Project': 'Obras',
      'Budget': 'Orçamentos',
      'Employee': 'Colaboradores',
      'Investment': 'Investimentos',
      'Measurement': 'Medições'
    };

    const actionLabels = {
      'create': 'Cadastro',
      'update': 'Atualização',
      'delete': 'Exclusão'
    };

    const friendlyName = entityLabels[entity_name] || entity_name;
    const friendlyAction = actionLabels[action] || action;

    // Criar descrição automática se não fornecida
    const autoDescription = description || `${friendlyAction} em ${friendlyName}`;

    // Criar nova versão
    await base44.asServiceRole.entities.VersionHistory.create({
      numero_versao: newVersion,
      data_lancamento: new Date().toISOString().split('T')[0],
      descricao: autoDescription,
      tipo_alteracao: 'sistema'
    });

    return Response.json({ 
      success: true, 
      version: newVersion,
      description: autoDescription
    });

  } catch (error) {
    console.error('Erro ao criar versão:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});