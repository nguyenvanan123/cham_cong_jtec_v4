import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ChamCong from "@/pages/ChamCong";
import TraCuu from "@/pages/TraCuu";
import Admin from "@/pages/Admin";
import UngTuyen from "@/pages/UngTuyen";
import GioiThieu from "@/pages/GioiThieu";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChamCong} />
      <Route path="/tra-cuu" component={TraCuu} />
      <Route path="/ung-tuyen" component={UngTuyen} />
      <Route path="/gioi-thieu" component={GioiThieu} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
