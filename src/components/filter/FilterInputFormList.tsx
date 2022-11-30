import React from "react";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import TextField, { TextFieldProps } from "@mui/material/TextField";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import {
  ArrayFilterInterface,
  ArrayFilterCategory,
  FilterType,
} from "../../interfaces/filter";
import { useArrayFilterContext } from "../../context/ArrayFilter";
import { nanoid } from "nanoid";
import Paper from "@mui/material/Paper";
import { useTranslation } from "react-i18next";
import FilterInputForm from "./FilterInputForm";

export default function FilterInputFormList(props: {
  afInputRow: ArrayFilterInterface[];
  setAfInputRow: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>;
  filterInputListRef: React.MutableRefObject<ArrayFilterInterface[]>;
}) {
  const { addArrayFilter } = useArrayFilterContext();
  const [arrayFilterType, setArrayFilterType] =
    React.useState<FilterType>("include");
  const [nameFilterAvail, setNameFilterAvail] = React.useState(false);
  const { t } = useTranslation();

  const addFilterInputForm = () => {
    props.setAfInputRow((list) => {
      return [
        ...list,
        {
          category: nameFilterAvail ? "keyword" : "name",
          id: nanoid(),
          type: "include",
          value: "",
        },
      ];
    });
  };
  const onArrayFilterTypeChanged = (event: SelectChangeEvent<FilterType>) => {
    setArrayFilterType(event.target.value as FilterType);
  };
  const addFilter = () => {
    const added = addArrayFilter([
      {
        filterType: arrayFilterType,
        id: nanoid(),
        filters: [...props.filterInputListRef.current],
      },
    ]);
    if (added) {
      props.setAfInputRow([]);
    }
  };

  React.useEffect(() => {
    const rows = props.afInputRow;

    props.filterInputListRef.current = rows;

    setNameFilterAvail(rows.some((row) => row.category === "name"));
  }, [props.afInputRow]);

  return (
    <Card variant="outlined" sx={{ overflow: "visible" }}>
      <CardContent sx={{ display: "flex", minHeight: "22rem" }}>
        {props.afInputRow.length > 0 ? (
          <Stack spacing={2} sx={{ width: "100%" }}>
            {props.afInputRow.map((input) => {
              return (
                <FilterInputForm
                  key={input.id}
                  value={input}
                  setInputList={props.setAfInputRow}
                  afInputListRef={props.filterInputListRef}
                  nameFilterAvail={nameFilterAvail}
                ></FilterInputForm>
              );
            })}
          </Stack>
        ) : (
          <Stack
            justifyContent="center"
            alignItems="center"
            sx={{ width: "100%" }}
          >
            <Typography color="textSecondary" variant="subtitle1" gutterBottom>
              {t("common.add_filter_elements")}
            </Typography>
          </Stack>
        )}
      </CardContent>
      <CardActions>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ width: "100%" }}
        >
          <Button onClick={addFilterInputForm}>
            {t("common.add_filter_element")}
          </Button>
          <Stack direction="row" gap={1}>
            <FormControl sx={{ minWidth: 120 }}>
              <InputLabel id="arrayFilterType">
                {t("common.category")}
              </InputLabel>
              <Select
                labelId="arrayFilterType"
                label={t("common.category")}
                size="small"
                value={arrayFilterType}
                onChange={onArrayFilterTypeChanged}
              >
                <MenuItem value="include">
                  {t("filter.category.include")}
                </MenuItem>
                <MenuItem value="exclude">
                  {t("filter.category.exclude")}
                </MenuItem>
                <MenuItem value="sleep">{t("filter.category.sleep")}</MenuItem>
              </Select>
            </FormControl>
            <Button
              disabled={props.afInputRow.length === 0}
              onClick={addFilter}
              variant="contained"
            >
              {t("common.add_filter")}
            </Button>
          </Stack>
        </Stack>
      </CardActions>
    </Card>
  );
}
