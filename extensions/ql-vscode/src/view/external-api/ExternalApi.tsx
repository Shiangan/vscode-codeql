import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DecodedBqrsChunk } from "../../pure/bqrs-cli-types";
import { ToExternalApiMessage } from "../../pure/interface-types";
import {
  VSCodeButton,
  VSCodeDataGrid,
  VSCodeDataGridCell,
  VSCodeDataGridRow,
} from "@vscode/webview-ui-toolkit/react";
import styled from "styled-components";
import { Call, ExternalApiUsage, ModeledMethod } from "./interface";
import { MethodRow } from "./MethodRow";
import { createDataExtensionYaml } from "./yaml";
import { vscode } from "../vscode-api";

export const ExternalApiContainer = styled.div``;

export function ExternalApi(): JSX.Element {
  const [results, setResults] = useState<DecodedBqrsChunk | undefined>(
    undefined,
  );
  const [modeledMethods, setModeledMethods] = useState<
    Record<string, ModeledMethod>
  >({});

  useEffect(() => {
    const listener = (evt: MessageEvent) => {
      if (evt.origin === window.origin) {
        const msg: ToExternalApiMessage = evt.data;
        if (msg.t === "setExternalApiRepoResults") {
          setResults(msg.results);
        }
      } else {
        // sanitize origin
        const origin = evt.origin.replace(/\n|\r/g, "");
        console.error(`Invalid event origin ${origin}`);
      }
    };
    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  const methods = useMemo(() => {
    const methodsByApiName = new Map<string, ExternalApiUsage>();

    results?.tuples.forEach((tuple) => {
      const externalApiInfo = tuple[0] as string;
      const supported = tuple[1] as boolean;
      const usage = tuple[2] as Call;

      const [packageWithType, methodDeclaration] = externalApiInfo.split("#");

      const packageName = packageWithType.substring(
        0,
        packageWithType.lastIndexOf("."),
      );
      const typeName = packageWithType.substring(
        packageWithType.lastIndexOf(".") + 1,
      );

      const methodName = methodDeclaration.substring(
        0,
        methodDeclaration.indexOf("("),
      );
      const methodParameters = methodDeclaration.substring(
        methodDeclaration.indexOf("("),
      );

      if (!methodsByApiName.has(externalApiInfo)) {
        methodsByApiName.set(externalApiInfo, {
          externalApiInfo,
          packageName,
          typeName,
          methodName,
          methodParameters,
          supported,
          usages: [],
        });
      }

      const method = methodsByApiName.get(externalApiInfo)!;
      method.usages.push(usage);
    });

    const externalApiUsages = Array.from(methodsByApiName.values());
    externalApiUsages.sort((a, b) => {
      // Sort by number of usages descending
      return b.usages.length - a.usages.length;
    });
    return externalApiUsages;
  }, [results]);

  const yamlString = useMemo(() => {
    if (!methods) {
      return "";
    }

    return createDataExtensionYaml(methods, modeledMethods);
  }, [methods, modeledMethods]);

  const onChange = useCallback(
    (method: ExternalApiUsage, model: ModeledMethod) => {
      setModeledMethods((oldModeledMethods) => ({
        ...oldModeledMethods,
        [method.externalApiInfo]: model,
      }));
    },
    [],
  );

  const onApplyClick = useCallback(() => {
    vscode.postMessage({
      t: "applyDataExtensionYaml",
      yaml: yamlString,
    });
  }, [yamlString]);

  return (
    <ExternalApiContainer>
      <VSCodeButton onClick={onApplyClick}>Apply</VSCodeButton>

      <VSCodeDataGrid>
        <VSCodeDataGridRow rowType="header">
          <VSCodeDataGridCell cellType="columnheader" gridColumn={1}>
            Type
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={2}>
            Method
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={3}>
            Usages
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={4}>
            Model type
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={5}>
            Input
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={6}>
            Output
          </VSCodeDataGridCell>
          <VSCodeDataGridCell cellType="columnheader" gridColumn={7}>
            Kind
          </VSCodeDataGridCell>
        </VSCodeDataGridRow>
        {methods?.map((method) => (
          <MethodRow
            key={method.externalApiInfo}
            method={method}
            model={modeledMethods[method.externalApiInfo]}
            onChange={onChange}
          />
        ))}
      </VSCodeDataGrid>
      <pre>{yamlString}</pre>
    </ExternalApiContainer>
  );
}
