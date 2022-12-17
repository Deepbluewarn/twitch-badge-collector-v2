// import the original type declarations
import "i18next";

declare module "i18next" {
    interface CustomTypeOptions{
        returnNull: false;
    }
}