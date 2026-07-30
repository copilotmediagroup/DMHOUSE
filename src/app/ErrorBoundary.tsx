import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props={children:ReactNode};
type State={error:Error|null};

export default class ErrorBoundary extends Component<Props,State>{
  state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return{error};}
  componentDidCatch(error:Error,info:ErrorInfo){console.error('DMH Sales OS runtime error',error,info);}
  render(){
    if(this.state.error)return <div className="grid min-h-screen place-items-center bg-[#f4f7fb] p-6"><div className="w-full max-w-xl rounded-[24px] border border-red-200 bg-white p-8 shadow-xl"><p className="text-sm font-semibold text-red-600">Sales OS could not open this workspace</p><h1 className="mt-2 text-2xl font-semibold">A runtime error was caught.</h1><p className="mt-3 rounded-xl bg-red-50 p-4 text-sm text-red-800">{this.state.error.message}</p><button className="mt-6 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white" onClick={()=>window.location.reload()}>Reload Sales OS</button></div></div>;
    return this.props.children;
  }
}
