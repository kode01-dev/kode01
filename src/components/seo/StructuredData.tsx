import React from 'react';
import { serializeJsonForScriptTag } from '@/lib/security/serialize-json-for-script-tag';
import type { Json } from '@/types/database.types';

interface StructuredDataProps {
  data: Record<string, Json>;
}

/**
 * Enterprise-grade SEO component for injecting JSON-LD structured data.
 */
const StructuredData: React.FC<StructuredDataProps> = ({ data }) => {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonForScriptTag(data) }}
    />
  );
};

export default StructuredData;
