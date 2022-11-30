import React from "react";
import { styled } from "@mui/material/styles";
import {
  GridColDef,
  GridRenderCellParams,
  GridRowId,
  GridToolbarContainer,
  GridToolbarFilterButton,
} from "@mui/x-data-grid";
import {
  ArrayFilterInterface,
  ArrayFilterListInterface,
  FilterType,
} from "../../interfaces/filter";
import { ImportFilter, ExportFilter } from "./filterio";
import { useTranslation } from "react-i18next";
import Chip from "@mui/material/Chip";
import { CustomDataGrid } from "../datagrid/customDataGrid";
import { chipColor, onArrayFilterTypeChipClick } from "../chip/FilterTypeChip";
import Tooltip from "@mui/material/Tooltip";
import Avatar from "@mui/material/Avatar";
import { CustomToolbarItemStyle } from "../../style/toolbar";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import Stack from "@mui/material/Stack";

const ChipListStyle = styled(Stack)({
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  width: "100%",
  overflow: "auto",
  lineHeight: "1.5",

  ".chip-label-filterBadgeImage": {
    display: "inline-block",
    verticalAlign: "middle",
  },
  ".MuiChip-outlined": {
    maxWidth: "10rem",
  },
});

export function ArrayFilterList() {
  const { arrayFilter, setArrayFilter } = useArrayFilterContext();
  const [selectionModel, setSelectionModel] = React.useState<GridRowId[]>([]);
  const [showDeleteButton, setShowDeleteButton] = React.useState(false);
  const { t } = useTranslation();

  const columns: GridColDef[] = [
    {
      field: "filters",
      headerName: t("common.filter"),
      flex: 0.8,
      renderCell: (params: GridRenderCellParams<ArrayFilterInterface[]>) => {
        if (!params.value) return null;

        const chips = params.value.map((af) => {
          let title = `${t(`filter.type.${af.category || ""}`)}: ${af.value}`;
          let badgeAvatar;

          if (af.category === "badge") {
            const badgeUUID = af.value;
            title = af.badgeName || "";
            badgeAvatar = (
              <Avatar
                alt={af.badgeName}
                src={`https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/1`}
                srcSet={`https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/1 1x,
                                https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/2 2x,
                                https://static-cdn.jtvnw.net/badges/v1/${badgeUUID}/3 4x`}
              />
            );
          }
          return (
            <Tooltip key={title} title={title}>
              <Chip
                label={title}
                avatar={badgeAvatar}
                color={chipColor(af.type)}
              />
            </Tooltip>
          );
        });

        return <ChipListStyle direction="row">{chips}</ChipListStyle>;
      },
    },
    {
      field: "filterType",
      headerName: t("common.condition"),
      flex: 0.2,
      renderCell: (params: GridRenderCellParams<FilterType>) => {
        if (!params.value) return null;

        return (
          <Chip
            label={t(`filter.category.${params.value}`)}
            color={chipColor(params.value)}
            onClick={() => onArrayFilterTypeChipClick(params, setArrayFilter)}
          />
        );
      },
    },
  ];

  return (
    <CustomDataGrid
      rows={arrayFilter}
      columns={columns}
      components={{ Toolbar: CustomToolbar }}
      componentsProps={{
        toolbar: {
          selectionModel: selectionModel,
          showDeleteButton: showDeleteButton,
        },
      }}
      onSelectionModelChange={(ids) => {
        setShowDeleteButton(ids.length > 0);
        setSelectionModel(ids);
      }}
      selectionModel={selectionModel}
    />
  );
}

function CustomToolbar(props: {
  selectionModel: GridRowId[];
  showDeleteButton: boolean;
}) {
  return (
    <GridToolbarContainer>
      <GridToolbarFilterButton />
      <ImportFilter />
      <ExportFilter />
      <DeleteButton
        selectionModel={props.selectionModel}
        showDeleteButton={props.showDeleteButton}
      ></DeleteButton>
    </GridToolbarContainer>
  );
}

const DeleteButtonStyle = styled("div")({
  color: "#f44336",
});

function DeleteButton(props: {
  selectionModel: GridRowId[];
  showDeleteButton: boolean;
}) {
  const { setArrayFilter } = useArrayFilterContext();

  if (!props.showDeleteButton) return null;

  return (
    <DeleteButtonStyle>
      <CustomToolbarItemStyle
        direction="row"
        onClick={() => {
          deleteSelectedFilter(setArrayFilter, props.selectionModel);
        }}
      >
        <span className="material-icons-round">delete</span>
        <span>선택 삭제</span>
      </CustomToolbarItemStyle>
    </DeleteButtonStyle>
  );
}

function deleteSelectedFilter(
  setRows: React.Dispatch<React.SetStateAction<ArrayFilterListInterface[]>>,
  selectionModel: GridRowId[]
) {
  setRows((row) => {
    const newRow = row.filter((r) => {
      return !selectionModel.includes(r.id);
    });
    return newRow;
  });
}
