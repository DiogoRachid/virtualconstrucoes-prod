import { base44 } from '@/api/base44Client';

// --- PROMPT 4: BLOQUEIO DE LOOP ---
export const checkCircularDependency = async (serviceId, targetItemId) => {
  // Se o item a ser adicionado é o próprio serviço
  if (serviceId === targetItemId) return true;

  // Verificar se targetItemId já depende de serviceId (indireta)
  // BFS ou DFS na árvore de dependências
  const visited = new Set();
  const queue = [targetItemId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (currentId === serviceId) return true; // Loop detectado

    // Buscar itens deste serviço que sejam do tipo SERVICO
    // Nota: Isso pode ser pesado se não houver backend function, 
    // mas para MVP frontend-only fazemos via queries.
    const items = await base44.entities.ServiceItem.filter({
      servico_id: currentId,
      tipo_item: 'SERVICO'
    });

    for (const item of items) {
      queue.push(item.item_id);
    }
  }

  return false;
};

// --- PROMPT 2: MOTOR DE CÁLCULO DETERMINÍSTICO ---
// Helper para buscar tudo (paginação)
export const fetchAll = async (entityName) => {
  let allData = [];
  let page = 0;
  const limit = 1000;
  while (true) {
    const data = await base44.entities[entityName].list('created_date', limit, page * limit);
    if (!data || data.length === 0) break;
    allData.push(...data);
    if (data.length < limit) break;
    page++;
  }
  return allData;
};

// Helper para parsear data "MM/AAAA"
const parseDate = (str) => {
  if (!str) return new Date(9999, 11, 31); // Futuro se nulo
  const [mes, ano] = str.split('/');
  if (!mes || !ano) return new Date(9999, 11, 31);
  return new Date(parseInt(ano), parseInt(mes) - 1, 1);
};

export const recalculateService = async (serviceId) => {
  // 1. Buscar itens
  const items = await base44.entities.ServiceItem.filter({ servico_id: serviceId });
  
  let custoMaterial = 0;
  let custoMaoObra = 0;
  let maxNivelDep = 0;

  // Carregar dados de referência (snapshot de valor)
  for (const item of items) {
    let unitCost = 0;

    if (item.tipo_item === 'INSUMO') {
      const insumo = await base44.entities.Input.filter({ id: item.item_id }).then(r => r[0]);
      unitCost = insumo ? insumo.valor_unitario : 0;
    } else {
      const subService = await base44.entities.Service.filter({ id: item.item_id }).then(r => r[0]);
      unitCost = subService ? subService.custo_total : 0;
      if (subService && subService.nivel_max_dependencia >= maxNivelDep) {
        maxNivelDep = subService.nivel_max_dependencia + 1;
      }
    }

    const totalItem = item.quantidade * unitCost;

    // Atualizar item se mudou
    if (item.custo_unitario_snapshot !== unitCost || item.custo_total_item !== totalItem) {
      try {
        await base44.entities.ServiceItem.update(item.id, {
          custo_unitario_snapshot: unitCost,
          custo_total_item: totalItem
        });
      } catch (e) {
        // Ignorar se o item foi deletado
        console.warn('Falha ao atualizar item de serviço', item.id, e);
      }
    }

    if (item.tipo_item === 'SERVICO') {
      // Para sub-serviços, herdamos a quebra de custos proporcional
      const subService = await base44.entities.Service.filter({ id: item.item_id }).then(r => r[0]);
      if (subService) {
        const matRatio = subService.custo_total ? (subService.custo_material / subService.custo_total) : 0;
        const laborRatio = subService.custo_total ? (subService.custo_mao_obra / subService.custo_total) : 0;

        custoMaterial += totalItem * matRatio;
        custoMaoObra += totalItem * laborRatio;
      } else {
        // Fallback para categoria do item se serviço não encontrado ou vazio
        if (item.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
        else custoMaterial += totalItem;
      }
      } else {
      // Para insumos, PRIORIDADE TOTAL para a categoria do cadastro do INSUMO
      const insumo = await base44.entities.Input.filter({ id: item.item_id }).then(r => r[0]);
      if (insumo) {
         // Se o insumo tem categoria definida, usamos ela
         if (insumo.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
         else custoMaterial += totalItem;
      } else {
         // Fallback se não achar insumo (usa snapshot do item)
         if (item.categoria === 'MAO_OBRA') custoMaoObra += totalItem;
         else custoMaterial += totalItem;
      }
      }
      }

      const custoTotal = custoMaterial + custoMaoObra;

      // 6. Salvar no serviço
      await base44.entities.Service.update(serviceId, {
      custo_material: custoMaterial,
      custo_mao_obra: custoMaoObra,
      custo_total: custoTotal,
      nivel_max_dependencia: maxNivelDep
      // data_base removido para não sobrescrever
      });

  return { custo_total: custoTotal };
};

// --- PROMPT 3: ATUALIZAÇÃO EM CASCATA ---
export const updateDependents = async (itemType, itemId) => {
  // Localizar serviços que usam este item
  const dependentItems = await base44.entities.ServiceItem.filter({
    tipo_item: itemType,
    item_id: itemId
  });

  // Obter IDs dos serviços pais únicos
  const parentServiceIds = [...new Set(dependentItems.map(d => d.servico_id))];

  for (const serviceId of parentServiceIds) {
    await recalculateService(serviceId);
    // Recursão
    await updateDependents('SERVICO', serviceId);
  }
};