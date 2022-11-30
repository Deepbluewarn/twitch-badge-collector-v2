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

export default function FilterInputForm(props: {
  value: ArrayFilterInterface;
  setInputList: React.Dispatch<React.SetStateAction<ArrayFilterInterface[]>>;
  afInputListRef: React.MutableRefObject<ArrayFilterInterface[]>;
  nameFilterAvail: boolean;
}) {
  const { t } = useTranslation();
  const inputChanged = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    const inputRef = props.afInputListRef.current;
    const newInputRef = inputRef.map((l) => {
      if (l.id === props.value.id) {
        if (l.category === "badge") {
          l.badgeName = newValue;
        } else {
          l.value = newValue;
        }
      }
      return l;
    });

    props.afInputListRef.current = newInputRef;
  };

  const selectorChanged = (
    event: SelectChangeEvent<ArrayFilterCategory | FilterType>,
    selectorType: "category" | "type"
  ) => {
    const newValue = event.target.value;

    props.setInputList((list) => {
      return list.map((l) => {
        if (l.id === props.value.id) {
          if (selectorType === "category") {
            l.category = newValue as ArrayFilterCategory;
          } else if (selectorType === "type") {
            l.type = newValue as FilterType;
          }
        }
        return l;
      });
    });
  };

  const removeList = (event: React.MouseEvent<HTMLElement>, id: string) => {
    props.setInputList((list) => list.filter((l) => l.id !== id));
  };

  return (
    <Stack direction="row" spacing={1}>
      {props.value.category === "badge" ? (
        <>
          <Paper
            variant="outlined"
            sx={{
              minWidth: 120,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <img
              src={`https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/1`}
              srcSet={`https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/1 1x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/2 2x, 
                            https://static-cdn.jtvnw.net/badges/v1/${props.value.value}/3 4x`}
            />
          </Paper>

          <CustomTextField
            label={t("common.badge_name")}
            defaultValue={props.value.badgeName}
            onChange={inputChanged}
          />
        </>
      ) : (
        <>
          <FormControl sx={{ minWidth: 120 }} size="small">
            <InputLabel id="filter-category-label">
              {t("common.category")}
            </InputLabel>
            <Select
              labelId="filter-category-label"
              className="filter-category"
              label={t("common.category")}
              value={props.value.category}
              onChange={(e) => selectorChanged(e, "category")}
            >
              <MenuItem disabled={props.nameFilterAvail} value="name">
                {t("common.nickname")}
              </MenuItem>
              <MenuItem value="keyword">{t("common.keyword")}</MenuItem>
            </Select>
          </FormControl>

          <CustomTextField
            label={t("common.value")}
            defaultValue={props.value.value}
            onChange={inputChanged}
          />
        </>
      )}

      <FormControl sx={{ minWidth: 120 }} size="small">
        <InputLabel id="filter-type-label">{t("common.category")}</InputLabel>
        <Select
          labelId="filter-type-label"
          className="filter-type"
          label={t("common.category")}
          value={props.value.type}
          onChange={(e) => selectorChanged(e, "type")}
        >
          <MenuItem value="include">{t("filter.category.include")}</MenuItem>
          <MenuItem value="exclude">{t("filter.category.exclude")}</MenuItem>
          <MenuItem value="sleep">{t("filter.category.sleep")}</MenuItem>
        </Select>
      </FormControl>
      <Button onClick={(e) => removeList(e, props.value.id)}>
        {t("common.remove")}
      </Button>
    </Stack>
  );
}

function CustomTextField(props: TextFieldProps) {
  return (
    <TextField
      {...props}
      id="outlined-basic"
      variant="outlined"
      size="small"
      fullWidth
    />
  );
}
