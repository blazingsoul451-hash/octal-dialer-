import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, ChevronRight, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportPanelProps {
  onImportSuccess: (campaignName: string, count: number) => void;
  serverUrl: string;
  authToken?: string;
  isLight?: boolean;
  campaigns?: any[];
}

export const ImportPanel: React.FC<ImportPanelProps> = ({ onImportSuccess, serverUrl, authToken, isLight, campaigns = [] }) => {
  const [file, setFile] = useState<File | null>(null);
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedName, setMappedName] = useState<string>('');
  const [mappedPhone, setMappedPhone] = useState<string>('');
  const [campaignName, setCampaignName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const ele = tableContainerRef.current;
    if (!ele) return;
    ele.style.cursor = 'grabbing';
    ele.style.userSelect = 'none';
    
    const startX = e.pageX - ele.offsetLeft;
    const scrollLeft = ele.scrollLeft;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.pageX - ele.offsetLeft;
      const walk = (x - startX) * 1.5;
      ele.scrollLeft = scrollLeft - walk;
    };

    const handleMouseUp = () => {
      ele.style.cursor = 'grab';
      ele.style.removeProperty('user-select');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  };

  const processFile = (file: File) => {
    setFile(file);
    setLoading(true);
    setError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        let rows: any[] = [];

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        } else {
          // simple CSV parser
          const text = data as string;
          const lines = text.split(/\r?\n/);
          if (lines.length > 0) {
            const csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
            const csvRows = [];
            for (let i = 1; i < lines.length; i++) {
              if (!lines[i].trim()) continue;
              const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
              const row: Record<string, string> = {};
              csvHeaders.forEach((h, idx) => {
                row[h] = values[idx] || '';
              });
              csvRows.push(row);
            }
            rows = csvRows;
          }
        }

        if (rows.length === 0) {
          throw new Error('This spreadsheet appears to be empty.');
        }

        setSheetData(rows);
        const fileHeaders = Object.keys(rows[0]);
        setHeaders(fileHeaders);

        // Attempt smart headers matching
        const phoneMatch = fileHeaders.find(h => 
          /phone|number|contact|dial|mobile|cell|tel/i.test(h)
        );
        const nameMatch = fileHeaders.find(h => 
          /name|client|doctor|lead|clinic|title|company|contact/i.test(h) && h !== phoneMatch
        );

        setMappedPhone(phoneMatch || fileHeaders[1] || fileHeaders[0] || '');
        setMappedName(nameMatch || fileHeaders[0] || '');
        setCampaignName(file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' '));

      } catch (err: any) {
        setError(err.message || 'Error reading file.');
        setFile(null);
      } finally {
        setLoading(false);
      }
    };

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!file || !mappedPhone) return;
    setLoading(true);
    setError(null);

    try {
      const parsedLeads = sheetData
        .map(row => ({
          name: mappedName ? String(row[mappedName] || '').trim() : 'Unknown Lead',
          phone: String(row[mappedPhone] || '').trim()
        }))
        .filter(lead => lead.phone.replace(/\D/g, '').length >= 5); // flexible validation

      if (parsedLeads.length === 0) {
        throw new Error('No valid leads with phone numbers found after mapping.');
      }

      const reqHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) reqHeaders['Authorization'] = `Bearer ${authToken}`;

      const res = await fetch(`${serverUrl}/api/leads/import`, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify({
          campaignName: campaignName.trim() || file.name,
          fileName: file.name,
          leads: parsedLeads
        })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to import campaign.');
      }

      onImportSuccess(result.name, result.count);
      resetState();
    } catch (err: any) {
      setError(err.message || 'Server error uploading leads.');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setSheetData([]);
    setHeaders([]);
    setMappedName('');
    setMappedPhone('');
    setCampaignName('');
    setError(null);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`border rounded-2xl p-6 shadow-2xl space-y-6 text-left select-none transition-colors ${
      isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#09090b] border-[#18181b] text-white'
    }`}>
      <div className={`flex justify-between items-center pb-4 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
        <div>
          <h2 className={`text-xl font-black font-display tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Upload Lead Spreadsheet (.CSV / .XLSX)
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Import contacts into a dedicated calling campaign with automatic phone normalization and cross-campaign deduplication.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 border rounded-full font-mono text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-400 border-amber-500/30">
            CSV / XLSX Ready
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 border text-xs rounded-2xl flex items-start gap-2 shadow-sm bg-red-500/10 border-red-500/30 text-red-400">
          <AlertCircle className="w-4.5 h-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!file ? (
        <div
          onClick={triggerFileSelect}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition select-none ${
            isLight
              ? 'border-slate-300 hover:border-amber-500 hover:bg-amber-50/40 bg-slate-50'
              : 'border-[#27272a] hover:border-amber-500 bg-[#121215]'
          }`}
        >
          <Upload className="w-10 h-10 mb-3 text-amber-500" />
          <p className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>Drag & drop or click to upload file</p>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-zinc-400'}`}>Supports Excel (.xlsx, .xls) and CSV sheets</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv, .xlsx, .xls"
            className="hidden"
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mappings Form */}
          <div className="lg:col-span-6 space-y-4">
            <div className={`flex items-center gap-3 p-3.5 border rounded-xl ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#121215] border-[#27272a]'
            }`}>
              <FileSpreadsheet className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="min-w-0">
                <p className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>{file.name}</p>
                <p className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{sheetData.length} records parsed</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className={`text-[10px] font-mono block uppercase font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                  Campaign Title
                </label>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none transition ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className={`text-[10px] font-mono block uppercase font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                    Phone Column *
                  </label>
                  <select
                    value={mappedPhone}
                    onChange={(e) => setMappedPhone(e.target.value)}
                    className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none transition cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                    }`}
                  >
                    <option value="">-- Select Column --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className={`text-[10px] font-mono block uppercase font-bold ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                    Name Column (Optional)
                  </label>
                  <select
                    value={mappedName}
                    onChange={(e) => setMappedName(e.target.value)}
                    className={`w-full border focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs font-mono font-bold focus:outline-none transition cursor-pointer ${
                      isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#121215] border-[#27272a] text-white'
                    }`}
                  >
                    <option value="">-- Default 'Unknown Lead' --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3">
              <button
                onClick={resetState}
                className={`flex-1 py-2.5 px-4 border text-xs font-mono font-bold rounded-xl transition-all cursor-pointer shadow-sm ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
                    : 'bg-[#18181b] hover:bg-[#27272a] border-[#27272a] text-zinc-300'
                }`}
              >
                Reset Upload
              </button>
              <button
                onClick={handleImport}
                disabled={loading || !mappedPhone || !campaignName.trim()}
                className={`flex-1 py-2.5 px-4 font-bold text-xs font-mono uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  loading || !mappedPhone || !campaignName.trim()
                    ? 'bg-[#18181b] border border-[#27272a] text-zinc-600 cursor-not-allowed shadow-none'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm'
                }`}
              >
                <span>{loading ? 'Importing...' : 'Import List'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Preview panel with horizontal sliding support */}
          <div className="lg:col-span-6 space-y-2 min-w-0">
            <div className="flex justify-between items-center">
              <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}>
                File Preview (First 5 records)
              </h3>
              <span className="text-[9px] font-mono px-2.5 py-0.5 rounded-full border font-bold bg-amber-500/10 border-amber-500/20 text-amber-500">
                ↔ Slide to view all ({headers.length}) columns
              </span>
            </div>
            <div 
              ref={tableContainerRef}
              onMouseDown={handleMouseDown}
              className={`border rounded-2xl overflow-x-auto max-w-full text-xs cursor-grab active:cursor-grabbing select-none ${
                isLight ? 'border-slate-200 bg-white' : 'border-[#18181b] bg-[#121215]'
              }`}>
              <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                <thead>
                  <tr className={`border-b font-mono text-[10px] uppercase ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-[#121215] border-[#18181b] text-zinc-400'
                  }`}>
                    <th className="p-3.5">#</th>
                    {headers.map(h => (
                      <th key={h} className={`p-3.5 ${h === mappedPhone ? 'text-amber-500 font-extrabold' : h === mappedName ? 'text-emerald-500 font-extrabold' : ''}`}>
                        {h} {h === mappedPhone ? '(Phone)' : h === mappedName ? '(Name)' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={`divide-y ${
                  isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'
                }`}>
                  {sheetData.slice(0, 5).map((row, idx) => (
                    <tr key={idx} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#18181b]/60'} transition`}>
                      <td className={`p-3.5 font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{idx + 1}</td>
                      {headers.map(h => (
                        <td key={h} className={`p-3.5 max-w-xs truncate ${h === mappedPhone ? 'font-mono text-amber-500 font-bold' : h === mappedName ? isLight ? 'font-bold text-slate-900' : 'font-bold text-white' : isLight ? 'text-slate-700' : ''}`}>
                          {String(row[h] || '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Active Campaigns List from Dashboard */}
      <div className={`mt-8 p-6 border rounded-2xl shadow-2xl space-y-4 ${
        isLight ? 'bg-white border-slate-200' : 'bg-[#09090b] border-[#18181b]'
      }`}>
        <div className={`flex justify-between items-center pb-3 border-b ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
          <div className="flex items-center gap-2">
            <h3 className={`text-xs font-mono font-black uppercase tracking-wider ${isLight ? 'text-slate-900' : 'text-white'}`}>
              Campaign Pipelines ({campaigns.length})
            </h3>
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className={`text-center py-8 text-xs font-mono ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>
            No active campaigns imported yet. Upload a CSV/XLSX sheet to begin.
          </div>
        ) : (
          <div className={`overflow-x-auto rounded-2xl border ${isLight ? 'border-slate-200' : 'border-[#18181b]'}`}>
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b text-[10px] uppercase tracking-wider ${
                  isLight ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-[#121215] text-zinc-400 border-[#18181b]'
                }`}>
                  <th className="p-3.5">Campaign Name</th>
                  <th className="p-3.5">Leads Count</th>
                  <th className="p-3.5">Source File</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${
                isLight ? 'divide-slate-200 text-slate-800' : 'divide-[#18181b] text-zinc-300'
              }`}>
                {campaigns.map((c, cIdx) => (
                  <tr key={c?.id || cIdx} className={`${isLight ? 'hover:bg-slate-50' : 'hover:bg-[#121215]/60'} transition`}>
                    <td className={`p-3.5 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{c?.name || 'Unnamed Campaign'}</td>
                    <td className="p-3.5 font-mono font-bold text-amber-500">{c?.leadCount || 0} leads</td>
                    <td className={`p-3.5 font-mono text-[11px] truncate max-w-[150px] ${isLight ? 'text-slate-500' : 'text-zinc-500'}`}>{c?.fileName || 'Manual Import'}</td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
