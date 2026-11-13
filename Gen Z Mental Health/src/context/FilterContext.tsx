import { createContext, useContext, useMemo, useState } from "react";
import { defaultFilters, filterRecords, type Filters, type RecordData } from "../data/data";
import { useDashboardData } from "../lib/api";

interface FilterContextValue {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  filtered: RecordData[];
  reset: () => void;
  activeCount: number;
  errorMode: boolean;
  setErrorMode: (value: boolean) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const { samples } = useDashboardData();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [errorMode, setErrorMode] = useState(false);
  const filtered = useMemo(() => filterRecords(samples, filters), [filters, samples]);
  const activeCount =
    filters.gender.length +
    filters.country.length +
    filters.platform.length +
    filters.purpose.length +
    filters.addiction.length +
    (filters.night !== "All" ? 1 : 0) +
    (filters.age[0] !== 14 || filters.age[1] !== 26 ? 1 : 0) +
    (filters.usage[0] !== 0 || filters.usage[1] !== 8 ? 1 : 0) +
    (filters.numPlatforms[0] !== 1 || filters.numPlatforms[1] !== 5 ? 1 : 0);
  return (
    <FilterContext.Provider
      value={{
        filters,
        setFilters,
        filtered,
        reset: () => setFilters(defaultFilters),
        activeCount,
        errorMode,
        setErrorMode,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const value = useContext(FilterContext);
  if (!value) throw new Error("useFilters must be used within FilterProvider");
  return value;
}
