import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { ViewState } from '../types';

export type EntityType = 'expense' | 'income' | 'account' | 'card' | 'category' | 'earning';

type SimpleAction = (id: string) => void;
type EntityAction = (entity: EntityType, id: string) => void;
export interface NavigatePayload {
  entity: EntityType;
  id: string;
  subtype?: string;
  view?: ViewState;
}

type HandlerMap = {
  openEditExpense: SimpleAction;
  openEditIncome: SimpleAction;
  openEditAccount: SimpleAction;
  openEditCard: SimpleAction;
  deleteItem: EntityAction;
  duplicateItem: EntityAction;
  viewDetails: EntityAction;
  navigateToResult: (payload: NavigatePayload) => void;
};

interface GlobalActionsContextValue extends HandlerMap {
  registerHandlers: (handlers: Partial<HandlerMap>) => () => void;
  highlightTarget: NavigatePayload | null;
  setHighlightTarget: (target: NavigatePayload | null) => void;
}

const warn = (message: string): SimpleAction => (id: string) => {
  console.warn(`[GlobalActions] ${message}`, { id });
};

const warnEntity = (message: string): EntityAction => (entity, id) => {
  console.warn(`[GlobalActions] ${message}`, { entity, id });
};

const defaultHandlers: HandlerMap = {
  openEditExpense: warn('openEditExpense handler not registered'),
  openEditIncome: warn('openEditIncome handler not registered'),
  openEditAccount: warn('openEditAccount handler not registered'),
  openEditCard: warn('openEditCard handler not registered'),
  deleteItem: warnEntity('deleteItem handler not registered'),
  duplicateItem: warnEntity('duplicateItem handler not registered'),
  viewDetails: warnEntity('viewDetails handler not registered'),
  navigateToResult: () => console.warn('[GlobalActions] navigateToResult handler not registered')
};

const GlobalActionsContext = createContext<GlobalActionsContextValue>({
  ...defaultHandlers,
  highlightTarget: null,
  setHighlightTarget: () => undefined,
  registerHandlers: () => {
    console.warn('[GlobalActions] registerHandlers called outside provider');
    return () => undefined;
  }
});

export const GlobalActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const handlersRef = useRef<HandlerMap>({ ...defaultHandlers });
  const [highlightTarget, setHighlightTarget] = useState<NavigatePayload | null>(null);

  const contextValue = useMemo<GlobalActionsContextValue>(() => ({
    openEditExpense: (id: string) => handlersRef.current.openEditExpense(id),
    openEditIncome: (id: string) => handlersRef.current.openEditIncome(id),
    openEditAccount: (id: string) => handlersRef.current.openEditAccount(id),
    openEditCard: (id: string) => handlersRef.current.openEditCard(id),
    deleteItem: (entity: EntityType, id: string) => handlersRef.current.deleteItem(entity, id),
    duplicateItem: (entity: EntityType, id: string) => handlersRef.current.duplicateItem(entity, id),
    viewDetails: (entity: EntityType, id: string) => handlersRef.current.viewDetails(entity, id),
    navigateToResult: (payload: NavigatePayload) => handlersRef.current.navigateToResult(payload),
    highlightTarget,
    setHighlightTarget,
    registerHandlers: (handlers: Partial<HandlerMap>) => {
      const previousEntries = Object.keys(handlers).reduce<Partial<HandlerMap>>((acc, key) => {
        const typedKey = key as keyof HandlerMap;
        acc[typedKey] = handlersRef.current[typedKey];
        return acc;
      }, {});
      handlersRef.current = { ...handlersRef.current, ...handlers };
      return () => {
        handlersRef.current = { ...handlersRef.current, ...previousEntries };
      };
    }
  }), [highlightTarget]);

  return (
    <GlobalActionsContext.Provider value={contextValue}>
      {children}
    </GlobalActionsContext.Provider>
  );
};

export const useGlobalActions = () => useContext(GlobalActionsContext);
