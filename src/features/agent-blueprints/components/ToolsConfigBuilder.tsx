'use client';

import { useState } from 'react';
import { Plus, Trash2, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export interface ToolConfig {
  name: string;
  description: string;
  parameters: string;
}

interface ToolsConfigBuilderProps {
  value: ToolConfig[];
  onChange: (tools: ToolConfig[]) => void;
  error?: string;
}

const emptyTool: ToolConfig = {
  name: '',
  description: '',
  parameters: '{}',
};

export default function ToolsConfigBuilder({
  value,
  onChange,
  error,
}: ToolsConfigBuilderProps) {
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);

  const handleAddTool = () => {
    onChange([...value, { ...emptyTool }]);
  };

  const handleRemoveTool = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleToolChange = (
    index: number,
    field: keyof ToolConfig,
    fieldValue: string
  ) => {
    const updated = value.map((tool, i) =>
      i === index ? { ...tool, [field]: fieldValue } : tool
    );
    onChange(updated);
  };

  const jsonPreview = JSON.stringify(value, null, 2);

  return (
    <div className="flex flex-col gap-4">
      {/* Tool cards */}
      {value.map((tool, index) => (
        <Card
          key={index}
          className={cn(
            'rounded-2xl border border-[#2B463C]/20 bg-[#F4F1EA]',
            'transition-shadow hover:shadow-md'
          )}
        >
          <CardContent className="flex flex-col gap-4 pt-6">
            {/* Card header row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#1A1A1A]">
                Tool {index + 1}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveTool(index)}
                className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-700"
                aria-label={`Remove tool ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Name field */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`tool-name-${index}`}
                className="text-xs font-medium text-[#1A1A1A]"
              >
                Name
              </Label>
              <Input
                id={`tool-name-${index}`}
                placeholder="e.g. web_search"
                value={tool.name}
                onChange={(e) =>
                  handleToolChange(index, 'name', e.target.value)
                }
                className="rounded-lg border-[#2B463C]/30 bg-white focus-visible:ring-[#F291C8]"
              />
            </div>

            {/* Description field */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`tool-desc-${index}`}
                className="text-xs font-medium text-[#1A1A1A]"
              >
                Description
              </Label>
              <Input
                id={`tool-desc-${index}`}
                placeholder="What does this tool do?"
                value={tool.description}
                onChange={(e) =>
                  handleToolChange(index, 'description', e.target.value)
                }
                className="rounded-lg border-[#2B463C]/30 bg-white focus-visible:ring-[#F291C8]"
              />
            </div>

            {/* Parameters field */}
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor={`tool-params-${index}`}
                className="text-xs font-medium text-[#1A1A1A]"
              >
                Parameters (JSON)
              </Label>
              <textarea
                id={`tool-params-${index}`}
                placeholder='{ "query": { "type": "string" } }'
                value={tool.parameters}
                onChange={(e) =>
                  handleToolChange(index, 'parameters', e.target.value)
                }
                rows={4}
                className={cn(
                  'w-full rounded-lg border border-[#2B463C]/30 bg-white px-3 py-2',
                  'font-mono text-sm text-[#1A1A1A]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F291C8]',
                  'resize-y placeholder:text-muted-foreground'
                )}
              />
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add tool button */}
      <Button
        type="button"
        variant="outline"
        onClick={handleAddTool}
        className={cn(
          'w-full rounded-2xl border-dashed border-[#2B463C]/30',
          'text-[#2B463C] hover:border-[#F291C8] hover:bg-[#F291C8]/10 hover:text-[#1A1A1A]'
        )}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add tool
      </Button>

      {/* Error message */}
      {error && (
        <p className="text-sm font-medium text-red-500">{error}</p>
      )}

      {/* JSON preview (collapsible) */}
      <div className="rounded-2xl border border-[#2B463C]/20 bg-[#1A1A1A]">
        <button
          type="button"
          onClick={() => setJsonPreviewOpen((prev) => !prev)}
          className={cn(
            'flex w-full items-center justify-between px-4 py-3',
            'text-sm font-medium text-[#F4F1EA]'
          )}
        >
          <span className="flex items-center gap-2">
            <Code className="h-4 w-4 text-[#F291C8]" />
            JSON Preview
          </span>
          {jsonPreviewOpen ? (
            <ChevronUp className="h-4 w-4 text-[#F4F1EA]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[#F4F1EA]" />
          )}
        </button>

        {jsonPreviewOpen && (
          <pre
            className={cn(
              'max-h-64 overflow-auto border-t border-[#F4F1EA]/10 px-4 py-3',
              'font-mono text-xs leading-relaxed text-[#F291C8]'
            )}
          >
            {jsonPreview}
          </pre>
        )}
      </div>
    </div>
  );
}
