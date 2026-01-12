import React, { useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  NodeProps,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X } from 'lucide-react';
import type { Account, CreditCard, Expense, Income } from '../../types';
import type { YieldRecord } from '../../services/yieldsService';
import {
  formatCompactCurrency,
  formatCurrency,
  formatShortDate,
  isTaxExpense
} from './reportUtils';

export type ReportTransactions = {
  incomes: Income[];
  expenses: Expense[];
};

type NodeKind = 'center' | 'main' | 'sub';

type NodeGroup =
  | 'fixed'
  | 'variable'
  | 'personal'
  | 'cards'
  | 'rendimentos'
  | 'taxes';

interface ReportNodeData {
  label: string;
  value: number;
  percent: number;
  kind: NodeKind;
  group?: NodeGroup;
  category?: string;
  referenceId?: string;
  isMore?: boolean;
  size: number;
  color: string;
  background: string;
}

interface FinancialMapProps {
  summary: {
    totalReceitas: number;
    totalDespesas: number;
  };
  transactions: ReportTransactions;
  yields: YieldRecord[];
  accounts: Account[];
  creditCards: CreditCard[];
  periodLabel: string;
  isMobile: boolean;
}

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
};

const ReportNode = ({ data }: NodeProps<ReportNodeData>) => {
  const isCenter = data.kind === 'center';
  const label = data.isMore ? '+ ver mais' : data.label;
  const valueText = data.isMore ? '' : formatCompactCurrency(data.value);
  const percentText = data.isMore ? '' : `${Math.round(data.percent)}%`;

  return (
    <div
      className="flex items-center justify-center text-center rounded-full border border-white/10 text-white shadow-lg"
      style={{
        width: data.size,
        height: data.size,
        background: data.background,
        borderColor: data.color,
        boxShadow: `0 12px 30px ${hexToRgba(data.color, 0.25)}`
      }}
    >
      <div className="px-3 space-y-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/70">
          {label}
        </div>
        {isCenter ? (
          <div className="text-3xl font-semibold text-white">{Math.round(data.percent)}%</div>
        ) : (
          <>
            <div className="text-sm font-semibold text-white">{valueText}</div>
            <div className="text-[10px] text-white/60">{percentText}</div>
          </>
        )}
      </div>
    </div>
  );
};

const sumAmounts = (items: Array<{ amount: number }>) =>
  items.reduce((acc, item) => acc + item.amount, 0);

const buildCategoryTotals = (items: Array<{ category?: string; amount: number }>) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    const key = item.category?.trim() || 'Sem categoria';
    map.set(key, (map.get(key) || 0) + item.amount);
  });
  return Array.from(map.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
};

const buildCardTotals = (items: Expense[], cards: CreditCard[]) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    if (!item.cardId) return;
    map.set(item.cardId, (map.get(item.cardId) || 0) + item.amount);
  });
  const cardMap = new Map(cards.map(card => [card.id, card.name]));
  return Array.from(map.entries())
    .map(([cardId, total]) => ({
      id: cardId,
      label: cardMap.get(cardId) || 'Cartão',
      total
    }))
    .sort((a, b) => b.total - a.total);
};

const buildYieldTotals = (items: YieldRecord[], accounts: Account[]) => {
  const map = new Map<string, number>();
  items.forEach(item => {
    map.set(item.accountId, (map.get(item.accountId) || 0) + item.amount);
  });
  const accountMap = new Map(accounts.map(account => [account.id, account.name]));
  return Array.from(map.entries())
    .map(([accountId, total]) => ({
      id: accountId,
      label: accountMap.get(accountId) || 'Conta',
      total
    }))
    .sort((a, b) => b.total - a.total);
};

const buildPosition = (radius: number, angle: number) => ({
  x: radius * Math.cos(angle),
  y: radius * Math.sin(angle)
});

const FinancialMap: React.FC<FinancialMapProps> = ({
  summary,
  transactions,
  yields,
  accounts,
  creditCards,
  periodLabel,
  isMobile
}) => {
  const [activeNode, setActiveNode] = useState<ReportNodeData | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<
    | {
        node: ReportNodeData;
        x: number;
        y: number;
      }
    | null
  >(null);

  const expenseFixed = transactions.expenses.filter(exp => exp.type === 'fixed');
  const expenseVariable = transactions.expenses.filter(exp => exp.type === 'variable');
  const expensePersonal = transactions.expenses.filter(exp => exp.type === 'personal');
  const expenseCards = transactions.expenses.filter(exp => Boolean(exp.cardId));
  const expenseTaxes = transactions.expenses.filter(isTaxExpense);

  const totalFixed = sumAmounts(expenseFixed);
  const totalVariable = sumAmounts(expenseVariable);
  const totalPersonal = sumAmounts(expensePersonal);
  const totalCards = sumAmounts(expenseCards);
  const totalTaxes = sumAmounts(expenseTaxes);
  const totalRendimentos = sumAmounts(yields);

  const hasTaxNode = totalTaxes > 0;

  const mainNodes = useMemo(() => {
    const nodes = [
      { id: 'fixed', label: 'Despesas Fixas', value: totalFixed, group: 'fixed' as const },
      {
        id: 'variable',
        label: 'Despesas Variáveis',
        value: totalVariable,
        group: 'variable' as const
      },
      {
        id: 'personal',
        label: 'Despesas Pessoais',
        value: totalPersonal,
        group: 'personal' as const
      },
      { id: 'cards', label: 'Cartões', value: totalCards, group: 'cards' as const },
      {
        id: 'rendimentos',
        label: 'Rendimentos',
        value: totalRendimentos,
        group: 'rendimentos' as const
      }
    ];

    if (hasTaxNode) {
      nodes.push({ id: 'taxes', label: 'Impostos / MEI', value: totalTaxes, group: 'taxes' as const });
    }

    return nodes;
  }, [
    hasTaxNode,
    totalCards,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable
  ]);

  const groupColor = {
    fixed: '#38bdf8',
    variable: '#f97316',
    personal: '#f472b6',
    cards: '#6366f1',
    rendimentos: '#22c55e',
    taxes: '#eab308'
  } satisfies Record<NodeGroup, string>;

  const commitmentPercent = summary.totalReceitas > 0
    ? (summary.totalDespesas / summary.totalReceitas) * 100
    : 0;

  const commitmentColor =
    commitmentPercent <= 60
      ? '#22c55e'
      : commitmentPercent <= 80
        ? '#f59e0b'
        : '#ef4444';

  const groupData = useMemo(() => {
    return {
      fixed: {
        items: expenseFixed,
        total: totalFixed,
        categories: buildCategoryTotals(expenseFixed)
      },
      variable: {
        items: expenseVariable,
        total: totalVariable,
        categories: buildCategoryTotals(expenseVariable)
      },
      personal: {
        items: expensePersonal,
        total: totalPersonal,
        categories: buildCategoryTotals(expensePersonal)
      },
      cards: {
        items: expenseCards,
        total: totalCards,
        categories: buildCardTotals(expenseCards, creditCards)
      },
      rendimentos: {
        items: yields,
        total: totalRendimentos,
        categories: buildYieldTotals(yields, accounts)
      },
      taxes: {
        items: expenseTaxes,
        total: totalTaxes,
        categories: buildCategoryTotals(expenseTaxes)
      }
    };
  }, [
    accounts,
    creditCards,
    expenseCards,
    expenseFixed,
    expensePersonal,
    expenseTaxes,
    expenseVariable,
    totalCards,
    totalFixed,
    totalPersonal,
    totalRendimentos,
    totalTaxes,
    totalVariable,
    yields
  ]);

  const { nodes, edges } = useMemo(() => {
    const baseSize = isMobile ? 92 : 120;
    const sizeScale = isMobile ? 60 : 80;
    const maxValue = Math.max(...mainNodes.map(node => node.value), 1);

    const mainRadius = isMobile ? 210 : 270;
    const subRadius = isMobile ? 0 : 140;
    const centerRadius = isMobile ? 170 : 210;

    const nextNodes: Node<ReportNodeData>[] = [];
    const nextEdges: Edge[] = [];

    nextNodes.push({
      id: 'center',
      type: 'reportNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Receita Comprometida',
        value: summary.totalDespesas,
        percent: commitmentPercent,
        kind: 'center',
        size: centerRadius,
        color: commitmentColor,
        background: hexToRgba(commitmentColor, 0.22)
      }
    });

    const angleStep = (Math.PI * 2) / mainNodes.length;
    mainNodes.forEach((node, index) => {
      const angle = angleStep * index - Math.PI / 2;
      const pos = buildPosition(mainRadius, angle);
      const size = baseSize + (node.value / maxValue) * sizeScale;
      const color = groupColor[node.group];
      const totalBase = node.group === 'rendimentos' ? summary.totalReceitas : summary.totalDespesas;
      const percent = totalBase > 0 ? (node.value / totalBase) * 100 : 0;

      nextNodes.push({
        id: node.id,
        type: 'reportNode',
        position: pos,
        data: {
          label: node.label,
          value: node.value,
          percent,
          kind: 'main',
          group: node.group,
          size,
          color,
          background: hexToRgba(color, 0.2)
        }
      });

      nextEdges.push({
        id: `edge-center-${node.id}`,
        source: 'center',
        target: node.id,
        type: 'smoothstep',
        style: { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }
      });

      if (isMobile) return;

      const categories = groupData[node.group].categories;
      if (categories.length === 0) return;

      const top = categories.slice(0, 6);
      const hasMore = categories.length > 6;
      const totalGroup = Math.max(groupData[node.group].total, 1);
      const arcStep = top.length > 1 ? Math.PI / (top.length + 1) : 0;
      top.forEach((item, idx) => {
        const subAngle = angle - Math.PI / 2 + arcStep * (idx + 1);
        const subPos = {
          x: pos.x + subRadius * Math.cos(subAngle),
          y: pos.y + subRadius * Math.sin(subAngle)
        };

        const subSize = 80 + (item.total / totalGroup) * 40;
        const percentOfGroup = (item.total / totalGroup) * 100;
        const subId = `${node.id}-sub-${idx}`;

        const referenceId =
          'id' in item && typeof item.id === 'string' ? item.id : item.label;

        nextNodes.push({
          id: subId,
          type: 'reportNode',
          position: subPos,
          data: {
            label: 'label' in item ? item.label : 'Categoria',
            value: item.total,
            percent: percentOfGroup,
            kind: 'sub',
            group: node.group,
            category: 'label' in item ? item.label : undefined,
            referenceId,
            size: subSize,
            color,
            background: hexToRgba(color, 0.12)
          }
        });

        nextEdges.push({
          id: `edge-${node.id}-${subId}`,
          source: node.id,
          target: subId,
          type: 'smoothstep',
          style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }
        });
      });

      if (hasMore) {
        const moreAngle = angle + Math.PI / 2;
        const morePos = {
          x: pos.x + subRadius * Math.cos(moreAngle),
          y: pos.y + subRadius * Math.sin(moreAngle)
        };

        nextNodes.push({
          id: `${node.id}-more`,
          type: 'reportNode',
          position: morePos,
          data: {
            label: '+ ver mais',
            value: 0,
            percent: 0,
            kind: 'sub',
            group: node.group,
            isMore: true,
            size: 80,
            color,
            background: hexToRgba(color, 0.08)
          }
        });

        nextEdges.push({
          id: `edge-${node.id}-more`,
          source: node.id,
          target: `${node.id}-more`,
          type: 'smoothstep',
          style: { stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }
        });
      }
    });

    return { nodes: nextNodes, edges: nextEdges };
  }, [
    commitmentColor,
    commitmentPercent,
    groupColor,
    groupData,
    isMobile,
    mainNodes,
    summary.totalDespesas,
    summary.totalReceitas
  ]);

  const highlightedEdges = useMemo(
    () =>
      edges.map(edge => {
        if (!hoveredNodeId) return edge;
        const isActive = edge.source === hoveredNodeId || edge.target === hoveredNodeId;
        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: isActive ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.12)',
            strokeWidth: isActive ? 2 : 1
          }
        };
      }),
    [edges, hoveredNodeId]
  );

  const nodeTypes = useMemo(() => ({ reportNode: ReportNode }), []);

  const details = useMemo(() => {
    if (!activeNode) return null;
    if (!activeNode.group) {
      return {
        title: activeNode.label,
        value: activeNode.value,
        percent: activeNode.percent,
        items: transactions.expenses,
        group: 'center' as const
      };
    }
    const group = groupData[activeNode.group];
    let items = group.items;
    if (activeNode.kind === 'sub' && activeNode.referenceId) {
      if (activeNode.group === 'cards') {
        items = items.filter(item => 'cardId' in item && item.cardId === activeNode.referenceId);
      } else if (activeNode.group === 'rendimentos') {
        items = items.filter(item => 'accountId' in item && item.accountId === activeNode.referenceId);
      } else {
        items = items.filter(item => (item.category || 'Sem categoria') === activeNode.referenceId);
      }
    }
    return {
      title: activeNode.label,
      value: activeNode.kind === 'sub' ? activeNode.value : group.total,
      percent: activeNode.percent,
      items,
      group: activeNode.group
    };
  }, [activeNode, groupData, transactions.expenses]);

  const cardNameById = useMemo(
    () => new Map(creditCards.map(card => [card.id, card.name])),
    [creditCards]
  );

  const accountNameById = useMemo(
    () => new Map(accounts.map(account => [account.id, account.name])),
    [accounts]
  );

  const detailRows = useMemo(() => {
    if (!details) return [];
    if (details.group === 'rendimentos') {
      const sorted = [...(details.items as YieldRecord[])].sort((a, b) => {
        const aDate = new Date(a.date + 'T12:00:00').getTime();
        const bDate = new Date(b.date + 'T12:00:00').getTime();
        return bDate - aDate;
      });
      return sorted.slice(0, 12).map(item => ({
        id: item.id,
        title: accountNameById.get(item.accountId) || 'Conta',
        subtitle: item.notes || 'Rendimento',
        date: formatShortDate(item.date),
        amount: item.amount,
        badge: 'Rendimento'
      }));
    }
    const sorted = [...(details.items as Expense[])].sort((a, b) => {
      const aDate = new Date((a.dueDate || a.date) + 'T12:00:00').getTime();
      const bDate = new Date((b.dueDate || b.date) + 'T12:00:00').getTime();
      return bDate - aDate;
    });
    return sorted.slice(0, 12).map(item => ({
      id: item.id,
      title: item.description || 'Lançamento',
      subtitle: item.category || 'Sem categoria',
      date: formatShortDate(item.dueDate || item.date),
      amount: item.amount,
      badge: item.cardId ? cardNameById.get(item.cardId) || 'Cartão' : 'Despesa'
    }));
  }, [accountNameById, cardNameById, details]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Mapa Financeiro</h2>
          <p className="text-sm text-slate-300">{periodLabel}</p>
        </div>
        <div className="text-right text-sm text-slate-400">
          <div>Receita comprometida</div>
          <div className="text-white text-lg font-semibold">
            {commitmentPercent.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="relative bg-slate-900/60 border border-white/10 rounded-3xl overflow-hidden min-h-[560px]">
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={highlightedEdges}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            zoomOnScroll={!isMobile}
            panOnScroll
            onNodeClick={(_, node) => setActiveNode(node.data)}
            onPaneClick={() => setActiveNode(null)}
            onNodeMouseEnter={(event, node) => {
              if (isMobile) return;
              setHoveredNodeId(node.id);
              setHoverInfo({ node: node.data, x: event.clientX, y: event.clientY });
            }}
            onNodeMouseMove={(event, node) => {
              if (isMobile) return;
              setHoverInfo({ node: node.data, x: event.clientX, y: event.clientY });
            }}
            onNodeMouseLeave={() => {
              if (isMobile) return;
              setHoveredNodeId(null);
              setHoverInfo(null);
            }}
            fitViewOptions={{ padding: 0.2 }}
            className="bg-transparent"
          >
            <Background gap={24} color="rgba(255,255,255,0.06)" />
            {!isMobile && <Controls showInteractive={false} position="bottom-right" />}
          </ReactFlow>
        </ReactFlowProvider>

        {hoverInfo && (
          <div
            className="fixed z-30 pointer-events-none bg-slate-900/95 text-white text-xs px-3 py-2 rounded-lg shadow-lg"
            style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
          >
            <div className="font-semibold">{hoverInfo.node.label}</div>
            <div>{formatCurrency(hoverInfo.node.value)}</div>
            <div className="text-slate-400">{hoverInfo.node.percent.toFixed(1)}%</div>
          </div>
        )}

        {activeNode && details && (
          <div
            className={`absolute top-0 right-0 h-full w-full max-w-sm bg-slate-950/95 border-l border-white/10 p-5 overflow-y-auto ${
              isMobile ? 'max-w-full' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Detalhes</div>
                <h3 className="text-lg font-semibold text-white mt-2">{details.title}</h3>
                <p className="text-sm text-slate-300">
                  {formatCurrency(details.value)} • {details.percent.toFixed(1)}%
                </p>
              </div>
              <button
                onClick={() => setActiveNode(null)}
                className="text-slate-400 hover:text-white"
                aria-label="Fechar detalhes"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {detailRows.length === 0 && (
                <div className="text-sm text-slate-400">Sem lançamentos no período.</div>
              )}
              {detailRows.map(row => (
                <div
                  key={row.id}
                  className="flex items-start justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{row.title}</div>
                    <div className="text-xs text-slate-400">{row.subtitle}</div>
                    <div className="text-[11px] text-slate-500">{row.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">
                      {formatCurrency(row.amount)}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">
                      {row.badge}
                    </div>
                  </div>
                </div>
              ))}
              {details.items.length > detailRows.length && (
                <div className="text-xs text-slate-400">
                  Mostrando {detailRows.length} de {details.items.length} lançamentos.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FinancialMap;
