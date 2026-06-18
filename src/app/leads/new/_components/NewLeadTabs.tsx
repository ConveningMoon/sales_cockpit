"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CsvUploader } from "./CsvUploader";
import { NewLeadForm } from "./NewLeadForm";

export function NewLeadTabs() {
  return (
    <Tabs defaultValue="csv">
      <TabsList className="mb-6">
        <TabsTrigger value="csv">Subir CSV de LH2</TabsTrigger>
        <TabsTrigger value="manual">Alta manual</TabsTrigger>
      </TabsList>

      <TabsContent value="csv">
        <CsvUploader />
      </TabsContent>

      <TabsContent value="manual">
        <NewLeadForm />
      </TabsContent>
    </Tabs>
  );
}
