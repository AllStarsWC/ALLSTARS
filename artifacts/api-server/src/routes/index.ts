import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gachaRouter from "./gacha";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gacha", gachaRouter);

export default router;
